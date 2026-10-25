import { sb, loadSettings, loadEvents, DEFAULT_ALERTS } from './lib/supabase.js';
import { parseDay, isoDay, addDays, today, mondayOf, hhmm, dayLong, cap, weekRange, weekLabel } from './lib/dates.js';
import { ZONE, esc, placeOf } from './lib/events.js';
import { buildWhatsAppText, waPreviewHtml, copyText } from './lib/whatsapp.js';

const $ = (id) => document.getElementById(id);
const WEEKS_AHEAD = 16;
let settings = { visibleWeeks: [], alerts: DEFAULT_ALERTS };
let horizon = [];   // eventi da oggi a 12 mesi: usati per conteggi, prenotazioni e WhatsApp

const flash = (el, text) => { el.textContent = text; clearTimeout(el._t); el._t = setTimeout(() => (el.textContent = ''), 3500); };

/* ---------- Accesso ---------- */

async function enter() {
  const { data: isAdmin, error } = await sb.rpc('is_admin');
  if (error || !isAdmin) {
    await sb.auth.signOut();
    $('loginErr').textContent = error
      ? 'Il database non è ancora configurato: esegui supabase/setup.sql.'
      : 'Questo account non è tra gli admin. Aggiungi la sua email alla tabella admins.';
    return;
  }
  $('login').classList.add('hidden');
  $('panel').classList.remove('hidden');
  $('logout').classList.remove('hidden');

  settings = await loadSettings();
  const start = isoDay(addDays(mondayOf(today()), -7));
  horizon = await loadEvents(start, isoDay(addDays(today(), 365)));

  renderWeeks();
  renderAlerts();
  renderEvents();
  initWhatsApp();
}

$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('loginErr').textContent = '';
  const { error } = await sb.auth.signInWithPassword({ email: $('email').value.trim(), password: $('pass').value });
  if (error) { $('loginErr').textContent = 'Email o password non corrette.'; return; }
  enter();
});
$('logout').addEventListener('click', async () => { await sb.auth.signOut(); location.reload(); });
sb.auth.getSession().then(({ data }) => { if (data.session) enter(); });

/* ---------- Settimane ---------- */

function mondays() {
  const first = mondayOf(today());
  return Array.from({ length: WEEKS_AHEAD }, (_, i) => isoDay(addDays(first, i * 7)));
}

function countIn(monday) {
  const end = isoDay(addDays(parseDay(monday), 6));
  return horizon.filter((e) => e.date >= monday && e.date <= end).length;
}

function renderWeeks() {
  const selected = new Set(settings.visibleWeeks);
  $('weekList').innerHTML = mondays().map((w) => {
    const n = countIn(w);
    return `
      <label class="flex cursor-pointer items-center gap-3 rounded-xl border border-crinale bg-white px-4 py-3 has-checked:border-abete has-checked:ring-1 has-checked:ring-abete">
        <input type="checkbox" value="${w}" ${selected.has(w) ? 'checked' : ''} class="size-5 accent-porfido">
        <span class="min-w-0 flex-1">
          <span class="block font-display text-xl font-extrabold leading-tight">${esc(weekRange(w))}</span>
          <span class="block text-sm text-nebbia">${esc(weekLabel(w) === weekRange(w) ? '' : weekLabel(w) + ' · ')}${n ? `${n} eventi` : 'nessun evento ancora'}</span>
        </span>
      </label>`;
  }).join('');
}

$('quick4').addEventListener('click', () => {
  const next = new Set(mondays().slice(0, 4));
  $('weekList').querySelectorAll('input').forEach((i) => (i.checked = i.checked || next.has(i.value)));
});
$('clearWeeks').addEventListener('click', () => $('weekList').querySelectorAll('input').forEach((i) => (i.checked = false)));

$('saveWeeks').addEventListener('click', async () => {
  const values = [...$('weekList').querySelectorAll('input:checked')].map((i) => i.value).sort();
  const { error } = await sb.from('app_settings').upsert({ key: 'visible_weeks', value: values, updated_at: new Date().toISOString() });
  if (error) return flash($('weekMsg'), `Settimane non salvate: ${error.message}`);
  settings.visibleWeeks = values;
  flash($('weekMsg'), values.length
    ? `Salvate. Il sito mostra ${values.length} ${values.length === 1 ? 'settimana' : 'settimane'}.`
    : 'Salvate. Senza settimane attive il sito mostra solo la settimana corrente.');
  initWhatsApp();
});

/* ---------- Avvisi ---------- */

function renderAlerts() {
  $('alertMonth').checked = !!settings.alerts.month;
  $('alertFortnight').checked = !!settings.alerts.fortnight;
}

async function saveAlerts() {
  const value = { month: $('alertMonth').checked, fortnight: $('alertFortnight').checked };
  const { error } = await sb.from('app_settings').upsert({ key: 'booking_alerts', value, updated_at: new Date().toISOString() });
  if (error) { renderAlerts(); return flash($('alertMsg'), `Avvisi non salvati: ${error.message}`); }
  settings.alerts = value;
  const on = [value.month && '30 giorni', value.fortnight && '15 giorni'].filter(Boolean);
  flash($('alertMsg'), on.length ? `Salvato. Avvisi attivi: ${on.join(' e ')}.` : 'Salvato. Nessun avviso di prenotazione sul sito.');
  renderWhatsApp();
}
$('alertMonth').addEventListener('change', saveAlerts);
$('alertFortnight').addEventListener('change', saveAlerts);

/* ---------- Eventi da prenotare ---------- */

function renderEvents() {
  const q = $('evSearch').value.trim().toLowerCase();
  const until = isoDay(addDays(today(), Number($('evRange').value)));
  const from = isoDay(today());
  const list = horizon.filter((e) => e.date >= from && e.date <= until
    && (!$('evOnly').checked || e.booking_required)
    && (!q || [e.title, e.venue, e.comune].join(' ').toLowerCase().includes(q)));
  const flagged = list.filter((e) => e.booking_required).length;
  $('evCount').textContent = `${list.length} eventi, ${flagged} da prenotare.`;
  $('evList').innerHTML = list.slice(0, 300).map((ev) => `
    <li>
      <label class="flex cursor-pointer items-start gap-4 py-3 hover:bg-white">
        <input type="checkbox" data-id="${esc(ev.id)}" ${ev.booking_required ? 'checked' : ''} class="mt-1 size-5 shrink-0 accent-porfido">
        <span class="min-w-0">
          <span class="block font-semibold leading-snug">${esc(ev.title)}</span>
          <span class="block text-sm text-nebbia">${esc(cap(dayLong(parseDay(ev.date))))}${ev.time ? ', ' + hhmm(ev.time) : ''} · ${esc(placeOf(ev))}</span>
        </span>
      </label>
    </li>`).join('') || '<li class="py-6 text-nebbia">Nessun evento corrisponde alla ricerca.</li>';
}

$('evList').addEventListener('change', async (e) => {
  const cb = e.target.closest('input[data-id]'); if (!cb) return;
  cb.disabled = true;
  const { error } = await sb.from('events').update({ booking_required: cb.checked }).eq('id', cb.dataset.id);
  cb.disabled = false;
  if (error) { cb.checked = !cb.checked; alert(`Modifica non salvata: ${error.message}`); return; }
  const ev = horizon.find((x) => x.id === cb.dataset.id);
  if (ev) ev.booking_required = cb.checked;
  const n = horizon.filter((x) => x.booking_required && x.date >= isoDay(today())).length;
  $('evCount').textContent = `Salvato. ${n} eventi da prenotare in totale.`;
  renderWhatsApp();
});
['evSearch', 'evRange', 'evOnly'].forEach((id) => $(id).addEventListener('input', renderEvents));

/* ---------- WhatsApp ---------- */

let waText = '';

function initWhatsApp() {
  const visible = new Set(settings.visibleWeeks);
  $('waWeek').innerHTML = mondays().map((w) =>
    `<option value="${w}">${esc(weekRange(w))}${visible.has(w) ? '' : ' (non visibile)'}</option>`).join('');
  $('waZone').innerHTML = [['', 'Tutte le zone'], ...Object.entries(ZONE)].map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  renderWhatsApp();
}

function renderWhatsApp() {
  const monday = $('waWeek').value;
  if (!monday) return;
  const zone = $('waZone').value;
  const end = isoDay(addDays(parseDay(monday), 6));
  const events = horizon.filter((e) => e.date >= monday && e.date <= end && (!zone || e.zone === zone));
  const site = new URL('/', location.origin);
  site.searchParams.set('settimana', monday);
  waText = buildWhatsAppText({
    monday, events, alerts: settings.alerts,
    siteUrl: settings.visibleWeeks.includes(monday) ? site.toString() : location.origin + '/',
    title: zone ? `Eventi a ${ZONE[zone]}` : 'Eventi in Alto Adige',
  });
  $('waPreview').innerHTML = waPreviewHtml(waText);
  const tooLong = encodeURIComponent(waText).length > 7000;
  $('waOpen').hidden = tooLong;
  $('waOpen').href = `https://wa.me/?text=${encodeURIComponent(waText)}`;
  $('waMsg').textContent = `${events.length} eventi${tooLong ? '. Testo lungo: usa Copia testo.' : '.'}`;
}
['waWeek', 'waZone'].forEach((id) => $(id).addEventListener('change', renderWhatsApp));
$('waCopy').addEventListener('click', async () => {
  const ok = await copyText(waText);
  flash($('waMsg'), ok ? 'Testo copiato. Incollalo nella chat.' : 'Copia non riuscita: seleziona il testo a mano.');
});

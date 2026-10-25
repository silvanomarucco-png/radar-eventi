import { sb, loadSettings, loadEvents, DEFAULT_ALERTS, DEFAULT_WEEKS, MAX_WEEKS } from './lib/supabase.js';
import { parseDay, isoDay, addDays, today, hhmm, dayLong, cap, weekRange, weekStarts } from './lib/dates.js';
import { ZONE, esc, placeOf, isAutoBooking } from './lib/events.js';
import { buildWhatsAppText, waPreviewHtml, copyText } from './lib/whatsapp.js';

const $ = (id) => document.getElementById(id);
let settings = { weeksAhead: DEFAULT_WEEKS, alerts: DEFAULT_ALERTS };
let pickedWeeks = DEFAULT_WEEKS;
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
  pickedWeeks = settings.weeksAhead;
  const start = isoDay(today());
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

/* ---------- Password dimenticata ---------- */

// Letto subito: il client Supabase ripulisce l'hash dopo averlo usato
const urlHash = new URLSearchParams(location.hash.slice(1));
let recovering = urlHash.get('type') === 'recovery';
if (urlHash.get('error_description')) {
  $('loginErr').textContent = 'Il link non è più valido. Chiedine uno nuovo con "Password dimenticata?".';
}

function showReset() {
  recovering = true;
  $('login').classList.add('hidden');
  $('panel').classList.add('hidden');
  $('reset').classList.remove('hidden');
  $('newPass').focus();
}

$('forgot').addEventListener('click', async () => {
  const email = $('email').value.trim();
  if (!email) { $('forgotMsg').textContent = 'Scrivi prima la tua email nel campo qui sopra.'; $('email').focus(); return; }
  $('forgot').disabled = true;
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/admin.html` });
  $('forgot').disabled = false;
  $('forgotMsg').textContent = error
    ? (/rate limit/i.test(error.message)
      ? 'Email non inviata: Supabase ne manda solo poche all’ora. Riprova tra un’ora, oppure usa quella che hai già ricevuto.'
      : `Email non inviata: ${error.message}`)
    : `Se ${email} è un account admin, riceverai un'email con il link per scegliere una nuova password.`;
});

$('resetForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const pass = $('newPass').value;
  if (pass !== $('newPass2').value) { $('resetErr').textContent = 'Le due password non coincidono.'; return; }
  const { error } = await sb.auth.updateUser({ password: pass });
  if (error) { $('resetErr').textContent = `Password non salvata: ${error.message}`; return; }
  recovering = false;
  $('reset').classList.add('hidden');
  history.replaceState(null, '', location.pathname);
  enter();
});

sb.auth.onAuthStateChange((event) => { if (event === 'PASSWORD_RECOVERY') showReset(); });
sb.auth.getSession().then(({ data }) => {
  if (recovering && data.session) showReset();
  else if (data.session) enter();
});

/* ---------- Settimane ---------- */

function countIn(first) {
  const end = isoDay(addDays(parseDay(first), 6));
  return horizon.filter((e) => e.date >= first && e.date <= end).length;
}

function renderWeeks() {
  $('weeksPicker').innerHTML = Array.from({ length: MAX_WEEKS }, (_, i) => i + 1).map((n) => `
    <button type="button" role="radio" data-n="${n}" aria-checked="${n === pickedWeeks}" aria-pressed="${n === pickedWeeks}"
      class="chip min-w-12 text-base">${n}</button>`).join('');
  const starts = weekStarts(pickedWeeks);
  const last = addDays(parseDay(starts.at(-1)), 6);
  const total = starts.reduce((sum, w) => sum + countIn(w), 0);
  const saved = pickedWeeks === settings.weeksAhead;
  $('weeksPreview').textContent = `${pickedWeeks === 1 ? '1 settimana' : `${pickedWeeks} settimane`}: oggi fino a ${dayLong(last)}, ${total} eventi.`
    + (saved ? ' È l’impostazione attuale del sito.' : ' Non ancora salvato.');
}

$('weeksPicker').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-n]'); if (!b) return;
  pickedWeeks = Number(b.dataset.n);
  renderWeeks();
});

$('saveWeeks').addEventListener('click', async () => {
  const { error } = await sb.from('app_settings').upsert({ key: 'weeks_ahead', value: pickedWeeks, updated_at: new Date().toISOString() });
  if (error) return flash($('weekMsg'), `Settimane non salvate: ${error.message}`);
  settings.weeksAhead = pickedWeeks;
  renderWeeks();
  initWhatsApp();
  flash($('weekMsg'), `Salvato. Il sito mostra ${pickedWeeks === 1 ? '1 settimana' : `${pickedWeeks} settimane`} da oggi.`);
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
  const auto = list.filter((e) => isAutoBooking(e)).length;
  $('evCount').textContent = `${list.length} eventi: ${auto} con avviso automatico, ${flagged} segnalati da te.`;
  $('evList').innerHTML = list.slice(0, 300).map((ev) => `
    <li>
      <label class="flex cursor-pointer items-start gap-4 py-3 hover:bg-white">
        <input type="checkbox" data-id="${esc(ev.id)}" ${ev.booking_required ? 'checked' : ''} class="mt-1 size-5 shrink-0 accent-porfido">
        <span class="min-w-0">
          <span class="block font-semibold leading-snug">${esc(ev.title)}${isAutoBooking(ev) ? ' <span class="tag ml-1 bg-enrosadira/60 align-middle text-porfido-scuro">Avviso automatico</span>' : ''}</span>
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
  $('waWeek').innerHTML = weekStarts(MAX_WEEKS).map((w, i) =>
    `<option value="${w}">${esc(weekRange(w))}${i < settings.weeksAhead ? '' : ' (non visibile sul sito)'}</option>`).join('');
  $('waZone').innerHTML = [['', 'Tutte le zone'], ...Object.entries(ZONE)].map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  renderWhatsApp();
}

function renderWhatsApp() {
  const first = $('waWeek').value;
  if (!first) return;
  const zone = $('waZone').value;
  const end = isoDay(addDays(parseDay(first), 6));
  const events = horizon.filter((e) => e.date >= first && e.date <= end && (!zone || e.zone === zone));
  waText = buildWhatsAppText({
    start: first, events, alerts: settings.alerts,
    siteUrl: location.origin + '/',
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

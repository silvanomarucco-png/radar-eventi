import { sb, loadSettings, loadEvents, DEFAULT_ALERTS } from './lib/supabase.js';
import {
  parseDay, isoDay, addDays, today, mondayOf, daysUntil, hhmm,
  weekdayShort, dayLong, cap, weekRange, weekLabel,
} from './lib/dates.js';
import { CAT, ZONE, esc, bookingNotice, placeOf, groupByDay } from './lib/events.js';
import { buildWhatsAppText, waPreviewHtml, copyText } from './lib/whatsapp.js';

const $ = (id) => document.getElementById(id);
const SITE_URL = location.origin + location.pathname.replace(/index\.html$/, '');

const state = {
  weeks: [],                 // lunedì (ISO) visibili
  week: null,                // settimana selezionata
  alerts: DEFAULT_ALERTS,
  all: [],                   // eventi caricati (tutte le settimane visibili + prossimi 30 giorni)
  zone: '',
  cat: '',
  lastScan: null,
};

/* ---------- Caricamento ---------- */

async function init() {
  try {
    const s = await loadSettings().catch(() => ({ visibleWeeks: [], alerts: DEFAULT_ALERTS }));
    state.alerts = s.alerts;
    const thisMonday = isoDay(mondayOf(today()));
    // Mostra solo le settimane scelte dall'admin che non sono ancora finite
    state.weeks = s.visibleWeeks.filter((w) => addDays(parseDay(w), 6) >= today());
    if (!state.weeks.length) state.weeks = [thisMonday];

    const from = [state.weeks[0], isoDay(today())].sort()[0];
    const to = [isoDay(addDays(parseDay(state.weeks.at(-1)), 6)), isoDay(addDays(today(), 30))].sort().at(-1);
    state.all = await loadEvents(from, to).catch(async () => {
      // Se la vista del nuovo sito non è ancora stata creata, usa quella esistente
      const { data, error } = await sb.from('events_app').select('*').gte('date', from).lte('date', to).order('date').order('time', { nullsFirst: false });
      if (error) throw error;
      return data;
    });
    state.lastScan = state.all[0]?.last_scan || null;

    const asked = new URLSearchParams(location.search).get('settimana');
    state.week = state.weeks.includes(asked) ? asked : (state.weeks.includes(thisMonday) ? thisMonday : state.weeks[0]);

    renderWeekTabs();
    renderFilters();
    renderBookingRail();
    renderWeek(true);
  } catch (err) {
    $('summary').textContent = 'Non riesco a caricare gli eventi. Controlla la connessione e ricarica la pagina.';
    console.error(err);
  }
}

/* ---------- Dati derivati ---------- */

function weekEvents({ filtered = true } = {}) {
  const start = state.week;
  const end = isoDay(addDays(parseDay(start), 6));
  return state.all.filter((e) => e.date >= start && e.date <= end
    && (!filtered || ((!state.zone || e.zone === state.zone) && (!state.cat || e.cat === state.cat))));
}

/* ---------- Render ---------- */

function renderWeekTabs() {
  $('weeks').innerHTML = state.weeks.map((w) => `
    <button data-week="${w}" aria-pressed="${w === state.week}" class="chip shrink-0 whitespace-nowrap">
      ${esc(weekLabel(w))}
    </button>`).join('');
  $('weeks').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    state.week = b.dataset.week;
    const url = new URL(location.href);
    url.searchParams.set('settimana', state.week);
    history.replaceState(null, '', url);
    $('weeks').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', x === b));
    renderWeek(true);
  }));
}

function renderFilters() {
  const zones = [['', 'Tutte le zone'], ...Object.entries(ZONE)];
  $('zoneFilter').innerHTML = zones.map(([k, v]) =>
    `<button data-zone="${k}" aria-pressed="${state.zone === k}" class="chip shrink-0">${v}</button>`).join('');
  const cats = [['', 'Tutti i generi'], ...Object.entries(CAT)];
  $('catFilter').innerHTML = cats.map(([k, v]) =>
    `<button data-cat="${k}" aria-pressed="${state.cat === k}" class="chip shrink-0 whitespace-nowrap">${v}</button>`).join('');

  $('zoneFilter').onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    state.zone = b.dataset.zone; renderFilters(); renderWeek();
  };
  $('catFilter').onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    state.cat = b.dataset.cat; renderFilters(); renderWeek();
  };
}

function renderWeek(animate = false) {
  const range = $('weekRange');
  range.textContent = weekRange(state.week);
  if (animate) { range.classList.remove('rise'); void range.offsetWidth; range.classList.add('rise'); }

  const list = weekEvents();
  const total = weekEvents({ filtered: false }).length;
  const toBook = list.filter((e) => bookingNotice(e, state.alerts)).length;
  const comuni = new Set(list.map((e) => e.comune).filter(Boolean)).size;
  const parts = [];
  if (!total) parts.push('Il programma di questa settimana non è ancora disponibile.');
  else {
    parts.push(list.length === total
      ? `${total} eventi in ${comuni} ${comuni === 1 ? 'comune' : 'comuni'}.`
      : `${list.length} eventi su ${total} con i filtri scelti.`);
    if (toBook) parts.push(`${toBook} da prenotare.`);
  }
  if (state.lastScan) {
    const d = new Date(state.lastScan);
    parts.push(`Aggiornato il ${d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}.`);
  }
  $('summary').textContent = parts.join(' ');

  renderDayStrip(list);
  renderDays(list);
  renderShare(list);
}

function renderDayStrip(list) {
  const start = parseDay(state.week);
  const counts = {};
  list.forEach((e) => (counts[e.date] = (counts[e.date] || 0) + 1));
  $('dayStrip').innerHTML = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(start, i);
    const iso = isoDay(d);
    const n = counts[iso] || 0;
    const isToday = iso === isoDay(today());
    const past = d < today();
    return `
      <a href="#g-${iso}" ${n ? '' : 'aria-disabled="true" tabindex="-1"'}
         class="flex flex-col items-center rounded-lg py-1.5 ${n ? 'hover:bg-white' : 'pointer-events-none opacity-35'} ${past && n ? 'opacity-55' : ''} ${isToday ? 'bg-white ring-1 ring-porfido' : ''}"
         aria-label="${esc(dayLong(d))}: ${n} eventi">
        <span class="text-xs text-nebbia">${weekdayShort(d)}</span>
        <span class="font-display text-2xl font-extrabold leading-none tabular-nums">${d.getDate()}</span>
        <span class="mt-0.5 text-[0.6875rem] tabular-nums text-nebbia">${n || '–'}</span>
      </a>`;
  }).join('');
}

function tags(ev, { withCat = true } = {}) {
  const b = bookingNotice(ev, state.alerts);
  return [
    b ? `<span class="tag ${b.level === 'fortnight' ? 'bg-porfido text-white' : 'bg-enrosadira text-porfido-scuro'}">${esc(b.text)}</span>` : '',
    ev.is_new ? '<span class="tag bg-abete text-white">Nuovo</span>' : '',
    withCat && ev.cat ? `<span class="tag bg-calcare text-nebbia ring-1 ring-crinale">${esc(CAT[ev.cat] || ev.cat)}</span>` : '',
  ].join('');
}

function renderDays(list) {
  const box = $('giorni');
  const days = groupByDay(list);
  if (!days.length) {
    const filtered = state.zone || state.cat;
    box.innerHTML = `
      <div class="rounded-2xl border border-dashed border-crinale p-8 text-center">
        <p class="text-lg">${filtered ? 'Nessun evento con questi filtri.' : 'Nessun evento in questa settimana.'}</p>
        ${filtered ? '<button id="resetFilters" class="btn-ghost mt-4">Mostra tutti gli eventi</button>' : ''}
      </div>`;
    $('resetFilters')?.addEventListener('click', () => { state.zone = ''; state.cat = ''; renderFilters(); renderWeek(); });
    return;
  }
  box.innerHTML = days.map(([day, evs]) => {
    const past = daysUntil(day) < 0;
    return `
    <section id="g-${day}" class="pt-8 ${past ? 'opacity-60' : ''}" aria-labelledby="h-${day}">
      <h2 id="h-${day}" class="font-display text-[2rem] font-extrabold leading-none">
        ${esc(cap(dayLong(parseDay(day))))}
        ${daysUntil(day) === 0 ? '<span class="ml-2 align-middle font-sans text-sm font-semibold text-porfido">oggi</span>' : ''}
        ${past ? '<span class="ml-2 align-middle font-sans text-sm font-medium text-nebbia">concluso</span>' : ''}
      </h2>
      <ul class="mt-3 divide-y divide-crinale border-y border-crinale">
        ${evs.map(row).join('')}
      </ul>
    </section>`;
  }).join('');
  box.querySelectorAll('button[data-id]').forEach((b) =>
    b.addEventListener('click', () => openEvent(state.all.find((e) => e.id === b.dataset.id))));
}

function row(ev) {
  return `
    <li>
      <button data-id="${esc(ev.id)}" class="group grid w-full grid-cols-[3.75rem_1fr] gap-3 py-4 text-left sm:grid-cols-[4.5rem_1fr_auto] sm:gap-5">
        <span class="font-display text-[1.625rem] font-extrabold leading-none tabular-nums ${ev.time ? '' : 'text-nebbia/50'}">${ev.time ? hhmm(ev.time) : '—'}</span>
        <span class="min-w-0">
          <span class="block text-[1.125rem] font-semibold leading-snug group-hover:text-porfido">${esc(ev.title)}</span>
          <span class="mt-0.5 block text-[0.9375rem] text-nebbia">${esc(placeOf(ev))}</span>
          <span class="mt-2 flex flex-wrap gap-1.5">${tags(ev)}</span>
        </span>
        <span class="hidden self-center text-sm font-semibold text-porfido opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 sm:block">Dettagli</span>
      </button>
    </li>`;
}

function renderBookingRail() {
  const soon = state.all
    .filter((e) => daysUntil(e.date) >= 0 && bookingNotice(e, state.alerts))
    .sort((a, b) => a.date.localeCompare(b.date));
  $('bookingRail').classList.toggle('hidden', !soon.length);
  $('bookingList').innerHTML = soon.map((ev) => {
    const b = bookingNotice(ev, state.alerts);
    const urgent = b.level === 'fortnight';
    return `
      <li class="w-[17rem] shrink-0 snap-start">
        <button data-id="${esc(ev.id)}" class="flex h-full w-full flex-col rounded-2xl p-4 text-left ${urgent ? 'bg-porfido text-white' : 'bg-enrosadira text-abete'}">
          <span class="font-display text-[2.5rem] font-black leading-none tabular-nums">${b.days === 0 ? 'oggi' : b.days === 1 ? '1 giorno' : `${b.days} giorni`}</span>
          <span class="mt-1 text-sm ${urgent ? 'text-white/80' : 'text-porfido-scuro'}">${esc(b.text)}</span>
          <span class="mt-4 line-clamp-2 font-semibold leading-snug">${esc(ev.title)}</span>
          <span class="mt-1 text-sm ${urgent ? 'text-white/80' : 'text-nebbia'}">${esc(cap(dayLong(parseDay(ev.date))))}${ev.time ? ', ' + hhmm(ev.time) : ''}</span>
        </button>
      </li>`;
  }).join('');
  $('bookingList').querySelectorAll('button[data-id]').forEach((b) =>
    b.addEventListener('click', () => openEvent(state.all.find((e) => e.id === b.dataset.id))));
}

/* ---------- WhatsApp ---------- */

let shareText = '';

function renderShare(list) {
  const zoneName = state.zone ? ZONE[state.zone] : null;
  const catName = state.cat ? CAT[state.cat] : null;
  const title = ['Eventi', catName && `· ${catName}`, zoneName ? `a ${zoneName}` : 'in Alto Adige'].filter(Boolean).join(' ');
  const url = new URL(SITE_URL);
  url.searchParams.set('settimana', state.week);
  shareText = buildWhatsAppText({ monday: state.week, events: list, alerts: state.alerts, siteUrl: url.toString(), title });
  const tooLong = encodeURIComponent(shareText).length > 7000;

  document.querySelectorAll('[data-share-panel]').forEach((panel) => {
    panel.innerHTML = `
      <div class="mt-4 rounded-xl bg-[#EFEAE2] p-3">
        <div class="wa-bubble max-h-[46vh] overflow-y-auto">${waPreviewHtml(shareText)}</div>
      </div>
      <div class="mt-4 grid gap-2">
        <button data-copy class="btn-primary w-full">Copia testo</button>
        ${tooLong ? '' : `<a class="btn-ghost w-full" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(shareText)}">Apri in WhatsApp</a>`}
      </div>
      <p data-copied class="mt-2 min-h-5 text-center text-sm text-nebbia" aria-live="polite">${list.length} eventi${tooLong ? ' · testo lungo: usa Copia testo' : ''}</p>`;
    panel.querySelector('[data-copy]').addEventListener('click', async (e) => {
      const ok = await copyText(shareText);
      const btn = e.currentTarget;
      btn.textContent = ok ? 'Testo copiato' : 'Copia non riuscita';
      setTimeout(() => (btn.textContent = 'Copia testo'), 2200);
    });
  });
}

/* ---------- Dialoghi ---------- */

function openEvent(ev) {
  if (!ev) return;
  const d = parseDay(ev.date);
  $('evWhen').textContent = `${cap(dayLong(d))}${ev.time ? ', ore ' + hhmm(ev.time) : ''}`;
  $('evTitle').textContent = ev.title;
  $('evPlace').textContent = placeOf(ev);
  $('evTags').innerHTML = tags(ev);
  const desc = ev.full_description || ev.description;
  $('evDesc').textContent = desc || 'Trovi programma, prezzi e biglietti sulla pagina dell’evento.';
  $('evDesc').classList.toggle('text-nebbia', !desc);
  $('evSource').textContent = ev.source ? `Fonte: ${ev.source}` : '';

  const link = $('evLink');
  link.hidden = !ev.link;
  if (ev.link) {
    link.href = ev.link;
    link.textContent = ev.booking_required ? 'Prenota sulla pagina dell’evento' : 'Apri la pagina dell’evento';
  }
  const single = `*${ev.title}*\n${cap(dayLong(d))}${ev.time ? ', ore ' + hhmm(ev.time) : ''}\n📍 ${placeOf(ev)}${ev.link ? '\n🔗 ' + ev.link : ''}`;
  $('evWa').href = `https://wa.me/?text=${encodeURIComponent(single)}`;
  $('eventDialog').showModal();
}

document.querySelectorAll('dialog').forEach((dlg) => {
  dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target.closest('[data-close]')) dlg.close(); });
});
['openShare', 'openShareBar'].forEach((id) => $(id).addEventListener('click', () => $('shareDialog').showModal()));

init();

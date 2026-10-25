import { sb, loadSettings, loadEvents, DEFAULT_ALERTS, DEFAULT_WEEKS } from './lib/supabase.js';
import {
  parseDay, isoDay, addDays, today, daysUntil, hhmm,
  weekdayShort, monthShort, dayLong, cap, weekRange, weekStarts,
} from './lib/dates.js';
import { CAT, ZONE, esc, bookingNotice, bookingReminders, placeOf, groupByDay } from './lib/events.js';
import { loadLikes, toggleLike, heartSvg } from './lib/likes.js';

// Link "Password dimenticata?" arrivato sulla home (Site URL di Supabase): lo passo alla pagina admin
if (/type=recovery|error_description/.test(location.hash)) location.replace(`/admin.html${location.hash}`);

const $ = (id) => document.getElementById(id);

const state = {
  weeks: [],                 // primo giorno (ISO) di ogni blocco di 7 giorni visibile, a partire da oggi
  week: null,                // blocco selezionato
  alerts: DEFAULT_ALERTS,
  all: [],                   // eventi caricati (tutte le settimane visibili + prossimi 30 giorni)
  zone: '',
  cat: '',
  lastScan: null,
  likes: {},                 // id evento -> { likes, liked }
  likesOn: true,             // false se il database dei voti non risponde: i cuori spariscono
};

/* ---------- Caricamento ---------- */

async function init() {
  try {
    const s = await loadSettings().catch(() => ({ weeksAhead: DEFAULT_WEEKS, alerts: DEFAULT_ALERTS }));
    state.alerts = s.alerts;
    state.weeks = weekStarts(s.weeksAhead);

    const from = state.weeks[0];
    // +30 giorni oltre l'ultima settimana: servono gli eventi i cui avvisi di prenotazione cadono nel periodo
    const to = isoDay(addDays(parseDay(state.weeks.at(-1)), 6 + 30));
    state.all = await loadEvents(from, to).catch(async () => {
      // Se la vista del nuovo sito non è ancora stata creata, usa quella esistente
      const { data, error } = await sb.from('events_app').select('*').gte('date', from).lte('date', to).order('date').order('time', { nullsFirst: false });
      if (error) throw error;
      return data;
    });
    state.lastScan = state.all[0]?.last_scan || null;
    state.likes = await loadLikes(state.all.map((e) => e.id)).catch(() => { state.likesOn = false; return {}; });

    state.week = state.weeks[0];

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
  // Con una sola settimana i pulsanti non servono
  $('weeks').hidden = state.weeks.length < 2;
  $('weeks').innerHTML = state.weeks.map((w, i) => `
    <button data-week="${w}" aria-pressed="${w === state.week}" class="chip shrink-0 whitespace-nowrap">
      ${i === 0 ? 'Prossimi 7 giorni' : esc(weekRange(w))}
    </button>`).join('');
  $('weeks').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    state.week = b.dataset.week;
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
  const reminders = weekReminders();
  const toBook = reminders.length;
  const comuni = new Set(list.map((e) => e.comune).filter(Boolean)).size;
  const parts = [];
  if (!total) parts.push('Il programma di questi giorni non è ancora disponibile.');
  else {
    parts.push(list.length === total
      ? `${total} eventi in ${comuni} ${comuni === 1 ? 'comune' : 'comuni'}.`
      : `${list.length} eventi su ${total} con i filtri scelti.`);
    if (toBook) parts.push(`${toBook} ${toBook === 1 ? 'avviso' : 'avvisi'} di prenotazione.`);
  }
  if (state.lastScan) {
    const d = new Date(state.lastScan);
    parts.push(`Aggiornato il ${d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}.`);
  }
  $('summary').textContent = parts.join(' ');

  renderDayStrip(list, reminders);
  renderDays(list, reminders);
}

function weekReminders() {
  const end = isoDay(addDays(parseDay(state.week), 6));
  return bookingReminders(state.all, state.alerts, state.week, end)
    .filter(({ event: e }) => (!state.zone || e.zone === state.zone) && (!state.cat || e.cat === state.cat));
}

function renderDayStrip(list, reminders) {
  const start = parseDay(state.week);
  const counts = {};
  list.forEach((e) => (counts[e.date] = (counts[e.date] || 0) + 1));
  const withReminders = new Set(reminders.map((r) => r.date));
  $('dayStrip').innerHTML = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(start, i);
    const iso = isoDay(d);
    const n = counts[iso] || 0;
    const open = n || withReminders.has(iso);
    const isToday = iso === isoDay(today());
    const past = d < today();
    return `
      <a href="#g-${iso}" ${open ? '' : 'aria-disabled="true" tabindex="-1"'}
         class="flex flex-col items-center rounded-lg py-1.5 ${open ? 'hover:bg-white' : 'pointer-events-none opacity-35'} ${past && open ? 'opacity-55' : ''} ${isToday ? 'bg-white ring-1 ring-porfido' : ''}"
         aria-label="${esc(dayLong(d))}: ${n} eventi">
        <span class="text-xs text-nebbia">${weekdayShort(d)}</span>
        <span class="font-display text-2xl font-extrabold leading-none tabular-nums">${d.getDate()}</span>
        <span class="mt-0.5 text-[0.6875rem] tabular-nums text-nebbia">${n || '–'}</span>
      </a>`;
  }).join('');
}

function tags(ev, { withCat = true, withBooking = true } = {}) {
  const b = withBooking && bookingNotice(ev, state.alerts);
  return [
    b ? `<span class="tag ${b.level === 'fortnight' ? 'bg-porfido text-white' : 'bg-enrosadira text-porfido-scuro'}">${esc(b.text)}</span>` : '',
    ev.is_new ? '<span class="tag bg-abete text-white">Nuovo</span>' : '',
    withCat && ev.cat ? `<span class="tag bg-calcare text-nebbia ring-1 ring-crinale">${esc(CAT[ev.cat] || ev.cat)}</span>` : '',
  ].join('');
}

function renderDays(list, reminders) {
  const box = $('giorni');
  const days = groupByDay(list);
  const remByDay = {};
  reminders.forEach((r) => (remByDay[r.date] ||= []).push(r));
  // Un giorno può avere solo avvisi e nessun evento
  Object.keys(remByDay).forEach((d) => { if (!days.some(([day]) => day === d)) days.push([d, []]); });
  days.sort((a, b) => a[0].localeCompare(b[0]));
  if (!days.length) {
    const filtered = state.zone || state.cat;
    box.innerHTML = `
      <div class="rounded-2xl border border-dashed border-crinale p-8 text-center">
        <p class="text-lg">${filtered ? 'Nessun evento con questi filtri.' : 'Nessun evento in questi giorni.'}</p>
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
      ${evs.length ? `<ul class="mt-3 divide-y divide-crinale border-y border-crinale">${evs.map(row).join('')}</ul>` : ''}
      ${remByDay[day] ? `<ul class="mt-2 grid gap-1" aria-label="Avvisi di prenotazione">${remByDay[day].map(reminderRow).join('')}</ul>` : ''}
    </section>`;
  }).join('');
  box.querySelectorAll('button[data-id]').forEach((b) =>
    b.addEventListener('click', () => openEvent(state.all.find((e) => e.id === b.dataset.id))));
}

// Avviso di prenotazione: voce compatta, interlinea stretta, porta alla scheda dell'evento
function reminderRow(r) {
  const ev = r.event;
  const d = parseDay(ev.date);
  const when = `${weekdayShort(d)} ${d.getDate()} ${monthShort(d)}${ev.time ? ' ' + hhmm(ev.time) : ''}`;
  return `
    <li>
      <button data-id="${esc(ev.id)}" class="grid w-full grid-cols-[3.75rem_1fr] items-baseline gap-3 rounded-lg px-2 py-1.5 text-left text-[0.875rem] leading-tight sm:grid-cols-[4.5rem_1fr] sm:gap-5 ${r.level === 'fortnight' ? 'bg-enrosadira/70' : 'bg-enrosadira/35'} hover:bg-enrosadira">
        <span class="font-semibold text-porfido">Prenota</span>
        <span class="min-w-0"><span class="font-semibold">${esc(ev.title)}</span> <span class="text-nebbia">· ${esc(when)}, ${esc(placeOf(ev))}</span> <span class="whitespace-nowrap font-medium text-porfido-scuro">· ${esc(r.text)}</span></span>
      </button>
    </li>`;
}

/* ---------- Mi piace ---------- */

function likeButton(ev, extra = '') {
  if (!state.likesOn) return '';
  const { likes = 0, liked = false } = state.likes[ev.id] || {};
  return `
    <button type="button" data-like="${esc(ev.id)}" data-extra="${extra}" aria-pressed="${liked}"
      aria-label="${liked ? 'Togli il mi piace' : 'Mi piace'}: ${likes}"
      class="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold tabular-nums transition-colors ${liked ? 'bg-enrosadira/60 text-porfido' : 'text-nebbia hover:bg-white hover:text-porfido'} ${extra}">
      ${heartSvg(liked)}<span>${likes || ''}</span>
    </button>`;
}

function refreshLike(id) {
  const ev = state.all.find((e) => e.id === id);
  document.querySelectorAll(`[data-like="${CSS.escape(id)}"]`).forEach((b) => {
    const tmp = document.createElement('div');
    tmp.innerHTML = likeButton(ev, b.dataset.extra);
    const fresh = tmp.firstElementChild;
    const hadFocus = document.activeElement === b;
    b.replaceWith(fresh);
    if (hadFocus) fresh.focus();
  });
}

document.addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-like]'); if (!b) return;
  const id = b.dataset.like;
  const before = state.likes[id] || { likes: 0, liked: false };
  // Aggiorno subito, poi allineo con il database
  state.likes[id] = { liked: !before.liked, likes: before.likes + (before.liked ? -1 : 1) };
  refreshLike(id);
  try { state.likes[id] = await toggleLike(id); }
  catch { state.likes[id] = before; }
  refreshLike(id);
});

function row(ev) {
  return `
    <li class="flex items-center gap-2">
      <button data-id="${esc(ev.id)}" class="group grid min-w-0 flex-1 grid-cols-[3.75rem_1fr] gap-3 py-4 text-left sm:grid-cols-[4.5rem_1fr_auto] sm:gap-5">
        <span class="font-display text-[1.625rem] font-extrabold leading-none tabular-nums ${ev.time ? '' : 'text-nebbia/50'}">${ev.time ? hhmm(ev.time) : '—'}</span>
        <span class="min-w-0">
          <span class="block text-[1.125rem] font-semibold leading-snug group-hover:text-porfido">${esc(ev.title)}</span>
          <span class="mt-0.5 block text-[0.9375rem] text-nebbia">${esc(placeOf(ev))}</span>
          <span class="mt-2 flex flex-wrap gap-1.5">${tags(ev, { withBooking: false })}</span>
        </span>
        <span class="hidden self-center text-sm font-semibold text-porfido opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 sm:block">Dettagli</span>
      </button>
      ${likeButton(ev)}
    </li>`;
}

function renderBookingRail() {
  const soon = state.all
    // Solo gli eventi segnalati dall'admin: gli avvisi automatici stanno già nell'agenda
    .filter((e) => e.booking_required && daysUntil(e.date) >= 0 && bookingNotice(e, state.alerts))
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
  $('evLikeSlot').innerHTML = likeButton(ev, 'border border-crinale px-4 py-2.5');

  const link = $('evLink');
  link.hidden = !ev.link;
  if (ev.link) {
    link.href = ev.link;
    link.textContent = ev.booking_required ? 'Prenota sulla pagina dell’evento' : 'Apri la pagina dell’evento';
  }
  $('eventDialog').showModal();
}

document.querySelectorAll('dialog').forEach((dlg) => {
  dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target.closest('[data-close]')) dlg.close(); });
});

init();

import { parseDay, isoDay, today, hhmm, dayLong, cap } from './lib/dates.js';
import { CAT, esc, placeOf } from './lib/events.js';
import { topEvents } from './lib/likes.js';

const $ = (id) => document.getElementById(id);
const cache = {};
let period = 'next';

async function load() {
  const from = period === 'next' ? isoDay(today()) : null;
  try {
    cache[period] ||= await topEvents({ from, limit: 200 });
  } catch (err) {
    console.error(err);
    $('summary').textContent = 'Non riesco a caricare la classifica. Controlla la connessione e ricarica la pagina.';
    return;
  }
  render(cache[period]);
}

function bar(value, max) {
  // Barra orizzontale: un solo colore, estremità arrotondata, larghezza proporzionale al massimo
  const pct = max ? Math.max(4, Math.round((value / max) * 100)) : 0;
  return `<span class="block h-2 rounded-r-[4px] bg-porfido" style="width:${pct}%"></span>`;
}

function render(list) {
  const total = list.reduce((s, e) => s + e.likes, 0);
  $('summary').textContent = list.length
    ? `${total} mi piace su ${list.length} ${list.length === 1 ? 'evento' : 'eventi'}${period === 'next' ? ' in programma' : ''}.`
    : '';

  if (!list.length) {
    $('ranking').innerHTML = `
      <li class="py-10 text-center">
        <p class="text-lg">${period === 'next' ? 'Nessun evento in programma ha ancora ricevuto voti.' : 'Ancora nessun voto.'}</p>
        <p class="mt-1 text-nebbia">Apri l'agenda e tocca il cuore accanto agli eventi che ti piacciono.</p>
        <a href="/" class="btn-primary mt-5">Vai all'agenda</a>
      </li>`;
    $('byCat').innerHTML = '';
    return;
  }

  const max = list[0].likes;
  $('ranking').innerHTML = list.slice(0, 50).map((ev, i) => `
    <li class="grid grid-cols-[2.5rem_1fr] gap-3 py-4 sm:grid-cols-[3.5rem_1fr_9rem] sm:gap-5">
      <span class="font-display text-3xl font-black leading-none tabular-nums ${i < 3 ? 'text-porfido' : 'text-nebbia'}">${i + 1}</span>
      <span class="min-w-0">
        ${ev.link
          ? `<a href="${esc(ev.link)}" target="_blank" rel="noopener" class="block text-[1.125rem] font-semibold leading-snug hover:text-porfido">${esc(ev.title)}</a>`
          : `<span class="block text-[1.125rem] font-semibold leading-snug">${esc(ev.title)}</span>`}
        <span class="mt-0.5 block text-[0.9375rem] text-nebbia">${esc(cap(dayLong(parseDay(ev.date))))}${ev.time ? ', ' + hhmm(ev.time) : ''} · ${esc(placeOf(ev))}</span>
      </span>
      <span class="col-start-2 flex items-center gap-3 sm:col-start-3 sm:self-center">
        <span class="flex-1">${bar(ev.likes, max)}</span>
        <span class="w-14 text-right text-sm font-semibold tabular-nums" aria-label="${ev.likes} mi piace">♥ ${ev.likes}</span>
      </span>
    </li>`).join('');

  const byCat = {};
  list.forEach((e) => { byCat[e.cat] = (byCat[e.cat] || 0) + e.likes; });
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const catMax = cats[0][1];
  $('byCat').innerHTML = cats.map(([cat, n]) => `
    <li>
      <span class="flex items-baseline justify-between text-[0.9375rem]"><span class="font-medium">${esc(CAT[cat] || cat)}</span><span class="tabular-nums text-nebbia">${n}</span></span>
      <span class="mt-1 block">${bar(n, catMax)}</span>
    </li>`).join('');
}

document.querySelectorAll('[data-period]').forEach((b) => b.addEventListener('click', () => {
  period = b.dataset.period;
  document.querySelectorAll('[data-period]').forEach((x) => x.setAttribute('aria-pressed', x === b));
  load();
}));

load();

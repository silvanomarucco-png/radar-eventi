export const parseDay = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const today = () => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; };
export const daysUntil = (s) => Math.round((parseDay(s) - today()) / 86400000);
export const ddmm = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
export const hhmm = (t) => (t ? t.slice(0, 5) : '');

const fmt = (opts) => new Intl.DateTimeFormat('it-IT', opts);
export const weekdayLong = (d) => fmt({ weekday: 'long' }).format(d);
export const weekdayShort = (d) => fmt({ weekday: 'short' }).format(d).replace('.', '');
export const monthShort = (d) => fmt({ month: 'short' }).format(d).replace('.', '');
export const dayLong = (d) => fmt({ weekday: 'long', day: 'numeric', month: 'long' }).format(d);
export const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** "26 ott – 1 nov" oppure "2 – 8 nov" */
export function weekRange(first) {
  const start = typeof first === 'string' ? parseDay(first) : first;
  const end = addDays(start, 6);
  return start.getMonth() === end.getMonth()
    ? `${start.getDate()} – ${end.getDate()} ${monthShort(end)}`
    : `${start.getDate()} ${monthShort(start)} – ${end.getDate()} ${monthShort(end)}`;
}

/** Primo giorno (ISO) di ciascuno degli n blocchi di 7 giorni a partire da oggi */
export const weekStarts = (n) => Array.from({ length: n }, (_, i) => isoDay(addDays(today(), i * 7)));

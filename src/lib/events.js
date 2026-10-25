import { daysUntil } from './dates.js';

export const CAT = {
  classica: 'Classica', festival: 'Festival', live: 'Musica dal vivo', festa: 'Festa',
  sagra: 'Sagra', teatro: 'Teatro', film: 'Cinema',
};
export const ZONE = { bolzano: 'Bolzano', merano: 'Merano', dintorni: 'Dintorni' };

export const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Avviso di prenotazione per un evento, in base alle impostazioni admin.
 * level: "fortnight" (≤ 15 giorni) | "month" (≤ 30 giorni)
 */
export function bookingNotice(ev, alerts) {
  if (!ev.booking_required) return null;
  const d = daysUntil(ev.date);
  if (d < 0) return null;
  if (d <= 15 && alerts.fortnight) return { level: 'fortnight', days: d, text: 'Ultimi 15 giorni per prenotare' };
  if (d <= 30 && alerts.month && (d > 15 || !alerts.fortnight)) return { level: 'month', days: d, text: 'Ultimo mese per prenotare' };
  return null;
}

export const placeOf = (ev) => [ev.venue, ev.comune && ev.comune !== ev.venue ? ev.comune : null].filter(Boolean).join(', ');

export function groupByDay(list) {
  const byDay = {};
  list.forEach((e) => (byDay[e.date] ||= []).push(e));
  return Object.keys(byDay).sort().map((day) => [day, byDay[day]]);
}

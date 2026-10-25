import { daysUntil, parseDay, isoDay } from './dates.js';

export const CAT = {
  classica: 'Classica', festival: 'Festival', live: 'Musica dal vivo', festa: 'Festa',
  sagra: 'Sagra', teatro: 'Teatro', film: 'Cinema',
};
export const ZONE = { bolzano: 'Bolzano', merano: 'Merano', dintorni: 'Dintorni' };

export const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Come nel Radar Concerti: gli eventi a pagamento di queste categorie vanno prenotati,
// salvo quelli segnalati come gratuiti. L'admin può aggiungerne altri con booking_required.
const PAID_CATS = new Set(['classica', 'festival', 'live', 'teatro']);
export const isAutoBooking = (ev) =>
  PAID_CATS.has(ev.cat) && !/gratuit|ingresso libero/i.test(`${ev.description || ''} ${ev.full_description || ''}`);
export const needsBooking = (ev) => !!ev.booking_required || isAutoBooking(ev);

/**
 * Avviso di prenotazione per un evento, in base alle impostazioni admin.
 * level: "fortnight" (≤ 15 giorni) | "month" (≤ 30 giorni)
 */
export function bookingNotice(ev, alerts) {
  if (!needsBooking(ev)) return null;
  const d = daysUntil(ev.date);
  if (d < 0) return null;
  if (d <= 15 && alerts.fortnight) return { level: 'fortnight', days: d, text: 'Ultimi 15 giorni per prenotare' };
  if (d <= 30 && alerts.month && (d > 15 || !alerts.fortnight)) return { level: 'month', days: d, text: 'Ultimo mese per prenotare' };
  return null;
}

/**
 * Promemoria da mostrare nell'agenda: per ogni evento da prenotare, una voce
 * 30 giorni prima ("Ultimo mese") e una 15 giorni prima ("Ultimi 15 giorni"),
 * se l'admin ha attivato quell'avviso. Solo quelli con data tra from e to (ISO).
 */
export function bookingReminders(events, alerts, from, to) {
  const out = [];
  events.filter(needsBooking).forEach((ev) => {
    [[30, 'month', 'Ultimo mese per prenotare'], [15, 'fortnight', 'Ultimi 15 giorni per prenotare']].forEach(([days, level, text]) => {
      if (!alerts[level]) return;
      const d = parseDay(ev.date);
      d.setDate(d.getDate() - days);
      const date = isoDay(d);
      if (date >= from && date <= to) out.push({ reminder: true, id: `${ev.id}-pren${days}`, date, level, text, event: ev });
    });
  });
  return out.sort((a, b) => a.event.date.localeCompare(b.event.date) || (a.event.time || '').localeCompare(b.event.time || ''));
}

export const placeOf = (ev) => [ev.venue, ev.comune && ev.comune !== ev.venue ? ev.comune : null].filter(Boolean).join(', ');

export function groupByDay(list) {
  const byDay = {};
  list.forEach((e) => (byDay[e.date] ||= []).push(e));
  return Object.keys(byDay).sort().map((day) => [day, byDay[day]]);
}

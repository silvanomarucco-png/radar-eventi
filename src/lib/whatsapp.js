import { parseDay, addDays, ddmm, dayLong, cap, hhmm } from './dates.js';
import { bookingNotice, groupByDay, placeOf } from './events.js';

/**
 * Testo formattato per WhatsApp (*grassetto*, _corsivo_). Un evento per blocco, link su riga propria
 * così WhatsApp genera l'anteprima e il link resta cliccabile.
 */
export function buildWhatsAppText({ start: first, events, alerts, siteUrl, title = 'Eventi in Alto Adige' }) {
  const start = parseDay(first);
  const lines = [`*${title}*`, `_${ddmm(start)} – ${ddmm(addDays(start, 6))}_`, ''];
  const days = groupByDay(events);
  if (!days.length) lines.push('Nessun evento in programma questa settimana.');
  days.forEach(([day, list]) => {
    lines.push(`📅 *${cap(dayLong(parseDay(day)))}*`);
    list.forEach((ev) => {
      lines.push(`▪️ ${ev.time ? hhmm(ev.time) + ' · ' : ''}*${ev.title.trim()}*`);
      const place = placeOf(ev);
      if (place) lines.push(`   📍 ${place}`);
      const b = bookingNotice(ev, alerts);
      if (b) lines.push(`   ⏳ _${b.text}_`);
      if (ev.link) lines.push(`   🔗 ${ev.link}`);
    });
    lines.push('');
  });
  if (siteUrl) lines.push(`Programma completo: ${siteUrl}`);
  return lines.join('\n').trim();
}

/** Anteprima HTML dello stile WhatsApp: *grassetto*, _corsivo_, link. */
export function waPreviewHtml(text) {
  const esc = (t) => t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  return esc(text)
    .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<strong>$2</strong>')
    .replace(/(^|[\s(])_([^_\n]+)_/g, '$1<em>$2</em>');
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    const ta = Object.assign(document.createElement('textarea'), { value: text });
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.append(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove(); return ok;
  }
}

import { sb } from './supabase.js';

const KEY = 'radarEventi.voter';

/** Identificativo casuale di questo browser: un solo "mi piace" per evento */
export function voterId() {
  try {
    let id = localStorage.getItem(KEY);
    if (!id) { id = crypto.randomUUID(); localStorage.setItem(KEY, id); }
    return id;
  } catch {
    // Senza localStorage (navigazione privata bloccata) il voto vale per questa visita
    return (voterId.fallback ||= crypto.randomUUID());
  }
}

/** Mappa id evento -> { likes, liked } */
export async function loadLikes(ids) {
  if (!ids.length) return {};
  const { data, error } = await sb.rpc('likes_for', { p_ids: ids, p_voter: voterId() });
  if (error) throw error;
  return Object.fromEntries((data || []).map((r) => [r.event_id, { likes: Number(r.likes), liked: r.liked }]));
}

export async function toggleLike(id) {
  const { data, error } = await sb.rpc('toggle_like', { p_event: id, p_voter: voterId() });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return { likes: Number(row.likes), liked: row.liked };
}

export async function topEvents({ from = null, limit = 100 } = {}) {
  const { data, error } = await sb.rpc('top_events', { p_from: from, p_limit: limit });
  if (error) throw error;
  return (data || []).map((r) => ({ ...r, likes: Number(r.likes) }));
}

export const heartSvg = (filled) => `<svg aria-hidden="true" viewBox="0 0 24 24" class="size-5" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 7.9 3.6 4.5 7 4.5c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.4 0 5.6 3.4 4.3 6.8-1.8 4.6-9.3 9.2-9.3 9.2Z"/></svg>`;

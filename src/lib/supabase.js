import { createClient } from '@supabase/supabase-js';

// La chiave "publishable" è pubblica per progetto: la protezione dei dati è affidata alle policy RLS
// (vedi supabase/setup.sql). Si possono sovrascrivere con le variabili VITE_* su Netlify.
const URL = import.meta.env.VITE_SUPABASE_URL || 'https://svpsyanfvsosnukacpmp.supabase.co';
const KEY = import.meta.env.VITE_SUPABASE_KEY || 'sb_publishable_ilIYL44z1gP7rM1z_TYg1Q_pxbxlIdg';

export const sb = createClient(URL, KEY);

export const DEFAULT_ALERTS = { month: true, fortnight: true };
export const DEFAULT_WEEKS = 1;
export const MAX_WEEKS = 8;

export async function loadSettings() {
  const { data, error } = await sb.from('app_settings').select('key,value');
  if (error) throw error;
  const map = Object.fromEntries((data || []).map((r) => [r.key, r.value]));
  return {
    // Settimane da mostrare, contate in blocchi di 7 giorni a partire da oggi
    weeksAhead: Math.min(MAX_WEEKS, Math.max(1, Number(map.weeks_ahead) || DEFAULT_WEEKS)),
    alerts: { ...DEFAULT_ALERTS, ...(map.booking_alerts || {}) },
  };
}

export async function loadEvents(from, to) {
  const { data, error } = await sb
    .from('events_site')
    .select('*')
    .gte('date', from)
    .lte('date', to)
    .order('date')
    .order('time', { nullsFirst: false });
  if (error) throw error;
  return data || [];
}

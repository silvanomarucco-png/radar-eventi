-- Radar Eventi · sito pubblico + admin
-- Solo aggiunte: non modifica tabelle, viste o policy già usate da altre app (es. events_app).
-- Eseguibile più volte senza effetti collaterali.

-- 1) Flag "richiede prenotazione" sugli eventi
alter table public.events add column if not exists booking_required boolean not null default false;

-- 2) Chi è admin (le email qui dentro possono modificare impostazioni e prenotazioni)
create table if not exists public.admins (
  email text primary key
);
alter table public.admins enable row level security;
-- Nessuna policy: la tabella non è leggibile dal browser. Si gestisce dal SQL Editor:
--   insert into public.admins (email) values ('tua@email.it');

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins a where lower(a.email) = lower(auth.email()));
$$;
grant execute on function public.is_admin() to anon, authenticated;

-- 3) Impostazioni del sito
--    visible_weeks  : ["2026-10-26", ...]  lunedì delle settimane visibili
--    booking_alerts : {"month": true, "fortnight": true}
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
insert into public.app_settings (key, value) values
  ('visible_weeks', '[]'::jsonb),
  ('booking_alerts', '{"month": true, "fortnight": true}'::jsonb)
on conflict (key) do nothing;

alter table public.app_settings enable row level security;
drop policy if exists "impostazioni: lettura pubblica" on public.app_settings;
create policy "impostazioni: lettura pubblica" on public.app_settings
  for select to anon, authenticated using (true);
drop policy if exists "impostazioni: scrittura admin" on public.app_settings;
create policy "impostazioni: scrittura admin" on public.app_settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select on public.app_settings to anon, authenticated;
grant insert, update on public.app_settings to authenticated;

-- 4) L'admin può aggiornare gli eventi (es. booking_required). La lettura resta pubblica.
drop policy if exists "eventi: modifica admin" on public.events;
create policy "eventi: modifica admin" on public.events
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
grant update (booking_required) on public.events to authenticated;

-- 5) Vista dedicata al nuovo sito (events_app resta invariata per l'app esistente)
create or replace view public.events_site as
select e.id, e.title, e.date, e."time", e.venue, e.comune, e.zone, e.cat, e.link, e.source,
       e.description, e.full_description, e.booking_required, e.first_seen_at,
       (e.first_seen_at > m.prev_scan) as is_new,
       m.last_scan
from public.events e
cross join public.scan_meta m
where coalesce(e.hidden, false) = false;
grant select on public.events_site to anon, authenticated;

-- 6) FACOLTATIVO (consigliato): scan_meta e scan_log oggi hanno RLS disattivato,
--    quindi chiunque abbia la chiave pubblica può modificarle. Prima di attivarlo verifica
--    che lo scanner scriva con la service role key o via SQL (che ignorano RLS).
-- alter table public.scan_meta enable row level security;
-- create policy "scan_meta: lettura pubblica" on public.scan_meta for select to anon, authenticated using (true);
-- alter table public.scan_log enable row level security;

-- Radar Eventi · "Mi piace" sugli eventi
-- Solo aggiunte. Eseguibile più volte. I visitatori non hanno account: ogni browser ha un
-- identificativo casuale (voter) e può dare un solo "mi piace" per evento.
-- La tabella non è accessibile direttamente: si passa dalle funzioni qui sotto.

create table if not exists public.event_likes (
  event_id   text not null references public.events(id) on delete cascade,
  voter      uuid not null,
  created_at timestamptz not null default now(),
  primary key (event_id, voter)
);
create index if not exists event_likes_event_idx on public.event_likes (event_id);
alter table public.event_likes enable row level security;
-- Nessuna policy: lettura e scrittura solo tramite le funzioni security definer.

-- Conteggi e stato del visitatore per un elenco di eventi
create or replace function public.likes_for(p_ids text[], p_voter uuid)
returns table (event_id text, likes bigint, liked boolean)
language sql stable security definer set search_path = public
as $$
  select l.event_id, count(*) as likes, bool_or(l.voter = p_voter) as liked
  from public.event_likes l
  where l.event_id = any(p_ids)
  group by l.event_id;
$$;

-- Mette o toglie il "mi piace"; restituisce il nuovo stato
create or replace function public.toggle_like(p_event text, p_voter uuid)
returns table (likes bigint, liked boolean)
language plpgsql security definer set search_path = public
as $$
declare
  removed int;
begin
  if p_voter is null or not exists (select 1 from public.events e where e.id = p_event and not coalesce(e.hidden, false)) then
    raise exception 'evento non valido';
  end if;
  delete from public.event_likes where event_id = p_event and voter = p_voter;
  get diagnostics removed = row_count;
  if removed = 0 then
    insert into public.event_likes (event_id, voter) values (p_event, p_voter);
  end if;
  return query
    select count(*), removed = 0 from public.event_likes where event_id = p_event;
end;
$$;

-- Classifica: eventi più votati, opzionalmente solo da una certa data in poi
create or replace function public.top_events(p_from date default null, p_limit int default 100)
returns table (id text, title text, date date, "time" time, venue text, comune text, zone text, cat text, link text, likes bigint)
language sql stable security definer set search_path = public
as $$
  select e.id, e.title, e.date, e."time", e.venue, e.comune, e.zone, e.cat, e.link, count(*) as likes
  from public.event_likes l
  join public.events e on e.id = l.event_id
  where not coalesce(e.hidden, false)
    and (p_from is null or e.date >= p_from)
  group by e.id
  order by likes desc, e.date
  limit least(greatest(p_limit, 1), 500);
$$;

grant execute on function public.likes_for(text[], uuid) to anon, authenticated;
grant execute on function public.toggle_like(text, uuid) to anon, authenticated;
grant execute on function public.top_events(date, int) to anon, authenticated;

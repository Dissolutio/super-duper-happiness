-- Run once in the Supabase SQL Editor (after landings.sql and landings-move.sql).
-- Turns "landings" into full flight records: what the mission is, where it launched from, when it is back,
-- how we know, and a category (info / opportunity / alert). Safe to run once; the app keeps working for anyone on an older page.

alter table public.landings
  add column mission  text not null default 'attack'
    check (mission in ('attack','acs_attack','acs_defend','transport','deploy','espionage','harvest','expedition','moon_destruction','colonize','return')),
  add column category text not null default 'info' check (category in ('info','opportunity','alert')),
  add column origin_galaxy   smallint check (origin_galaxy between 1 and 7),
  add column origin_system   smallint check (origin_system between 1 and 499),
  add column origin_position smallint check (origin_position between 1 and 15),
  add column returns_at timestamptz,
  add column source text check (source in ('event','phalanx','probe','ally')),
  add constraint landings_origin_all_or_none check (
    (origin_galaxy is null and origin_system is null and origin_position is null)
    or (origin_galaxy is not null and origin_system is not null and origin_position is not null)),
  add constraint landings_returns_after_arrival check (returns_at is null or returns_at > arrives_at);

-- expeditions go to position 16 (deep space)
alter table public.landings drop constraint landings_position_check;
alter table public.landings add constraint landings_position_check check (position between 1 and 16);

-- rows entered before this existed: enemy incoming was an alert, everything else is information
update public.landings set category = 'alert' where side = 'theirs';

create index landings_returns_at on public.landings (returns_at) where returns_at is not null;

-- the new way in. Times are minutes from now, computed with the SERVER's clock.
create function public.add_flight(
  p_side text, p_mission text, p_category text,
  p_galaxy int, p_system int, p_position int, p_strength text, p_minutes int,
  p_origin_galaxy int, p_origin_system int, p_origin_position int,
  p_return_minutes int, p_source text
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_member() then raise exception 'not allowed'; end if;
  if p_minutes is null or p_minutes < 1 or p_minutes > 10080 then
    raise exception 'Arrival must be between 1 minute and 7 days from now';
  end if;
  if p_return_minutes is not null and (p_return_minutes <= p_minutes or p_return_minutes > 20160) then
    raise exception 'The fleet must be back after it lands (and within 14 days)';
  end if;
  insert into public.landings (author, side, mission, category, galaxy, system, position, strength, arrives_at,
                               origin_galaxy, origin_system, origin_position, returns_at, source)
  values ((select auth.uid()), p_side, p_mission, p_category, p_galaxy, p_system, p_position, trim(p_strength),
          now() + make_interval(mins => p_minutes),
          p_origin_galaxy, p_origin_system, p_origin_position,
          case when p_return_minutes is null then null else now() + make_interval(mins => p_return_minutes) end,
          p_source);
end $$;

revoke execute on function public.add_flight(text, text, text, int, int, int, text, int, int, int, int, int, text) from public, anon;
grant  execute on function public.add_flight(text, text, text, int, int, int, text, int, int, int, int, int, text) to authenticated;

-- the old function stays for pages that have not updated yet; enemy incoming is an alert there too
create or replace function public.add_landing(
  p_side text, p_galaxy int, p_system int, p_position int, p_strength text, p_minutes int
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_member() then raise exception 'not allowed'; end if;
  if p_minutes is null or p_minutes < 1 or p_minutes > 10080 then
    raise exception 'Arrival must be between 1 minute and 7 days from now';
  end if;
  insert into public.landings (author, side, category, galaxy, system, position, strength, arrives_at)
  values ((select auth.uid()), p_side, case when p_side = 'theirs' then 'alert' else 'info' end, p_galaxy, p_system, p_position, trim(p_strength),
          now() + make_interval(mins => p_minutes));
end $$;

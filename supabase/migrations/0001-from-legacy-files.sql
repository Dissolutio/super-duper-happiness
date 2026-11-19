-- 🔄 Migration 1: for a War Room database made with the ORIGINAL loose files (supabase/legacy/), before setup.sql existed.
-- Run it once in the SQL Editor. Safe to run twice. Fresh installs from setup.sql already have all of this.
-- What it does: starts version tracking, and lets coordinates go up to galaxy 9 (some servers have more than 7).
-- Before running: you must already have run every legacy file, including scans.sql. Check: select count(*) from public.scans;

begin;

create table if not exists public.schema_version (version int not null, updated_at timestamptz not null default now());
alter table public.schema_version enable row level security;
revoke all on public.schema_version from anon, authenticated;

alter table public.landings drop constraint if exists landings_galaxy_check;
alter table public.landings add constraint landings_galaxy_check check (galaxy between 1 and 9);
alter table public.landings drop constraint if exists landings_origin_galaxy_check;
alter table public.landings add constraint landings_origin_galaxy_check check (origin_galaxy between 1 and 9);
alter table public.moons drop constraint if exists moons_galaxy_check;
alter table public.moons add constraint moons_galaxy_check check (galaxy between 1 and 9);
alter table public.scans drop constraint if exists scans_galaxy_check;
alter table public.scans add constraint scans_galaxy_check check (galaxy between 1 and 9);

create or replace function public.add_scan(p_galaxy int, p_system int, p_position int, p_moon boolean, p_player bigint, p_fleet bigint, p_defense bigint, p_seen_at bigint)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_seen timestamptz := to_timestamp(p_seen_at);
  v public.scans;
begin
  if not public.is_member() then raise exception 'not allowed'; end if;
  if p_galaxy not between 1 and 9 or p_system not between 1 and 499 or p_position not between 1 and 15 then raise exception 'Those coordinates do not look right'; end if;
  if p_player is null or p_player < 1 then raise exception 'Missing player'; end if;
  if p_fleet is null or p_defense is null or p_fleet < 0 or p_defense < 0 or p_fleet > 1000000000000000 or p_defense > 1000000000000000 then raise exception 'Those values do not look right'; end if;
  if v_seen > now() + interval '1 day' or v_seen < now() - interval '60 days' then raise exception 'That report time does not look right'; end if;
  select * into v from public.scans where galaxy = p_galaxy and system = p_system and position = p_position and moon = coalesce(p_moon, false);
  if not found then
    insert into public.scans (galaxy, system, position, moon, player_id, fleet_value, defense_value, updated_by, observed_at)
    values (p_galaxy, p_system, p_position, coalesce(p_moon, false), p_player, p_fleet, p_defense, (select auth.uid()), v_seen);
    return 'new';
  end if;
  if v.observed_at >= v_seen then return 'older'; end if;
  update public.scans set player_id = p_player, fleet_value = p_fleet, defense_value = p_defense, updated_by = (select auth.uid()), observed_at = v_seen
   where galaxy = p_galaxy and system = p_system and position = p_position and moon = coalesce(p_moon, false);
  return 'updated';
end $$;

delete from public.schema_version;
insert into public.schema_version (version) values (1);

commit;

-- 🔄 Migration 2: spy reports keep the breakdown (ship and defence counts, building levels, resources) per planet or moon,
-- so the Players screen can show what was seen there. Run once in the SQL Editor after migration 1. Safe to run twice.

begin;

-- stop early with a clear message if migration 1 has not been run
do $$ begin
  if to_regclass('public.schema_version') is null then
    raise exception 'Run migrations/0001-from-legacy-files.sql first, then this file again. Nothing was changed.';
  end if;
end $$;

alter table public.scans add column if not exists ships jsonb;
alter table public.scans add column if not exists defense_units jsonb;
alter table public.scans add column if not exists buildings jsonb;
alter table public.scans add column if not exists resources bigint;

-- the old 8-argument add_scan is replaced by one with four optional extras (old pages still work through the defaults)
drop function if exists public.add_scan(int, int, int, boolean, bigint, bigint, bigint, bigint);
drop function if exists public.add_scan(int, int, int, boolean, bigint, bigint, bigint, bigint, jsonb, jsonb, jsonb, bigint);

-- { "id": count } maps from reports (ships, defence, building levels): only small whole numbers under number keys get in.
create or replace function public.clean_counts(p jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare k text; v jsonb; out jsonb := '{}'::jsonb; n int := 0;
begin
  if p is null or p = 'null'::jsonb then return null; end if;
  if jsonb_typeof(p) = 'array' and jsonb_array_length(p) = 0 then return out; end if;
  if jsonb_typeof(p) <> 'object' then raise exception 'Report details do not look right'; end if;
  for k, v in select * from jsonb_each(p) loop
    n := n + 1;
    if n > 60 or k !~ '^[0-9]{1,4}$' or jsonb_typeof(v) <> 'number' or (v::text)::numeric < 0 or (v::text)::numeric > 1000000000000 or (v::text)::numeric <> trunc((v::text)::numeric) then
      raise exception 'Report details do not look right';
    end if;
    out := out || jsonb_build_object(k, (v::text)::bigint);
  end loop;
  return out;
end $$;
revoke execute on function public.clean_counts(jsonb) from public, anon;

-- Returns 'new', 'updated' or 'older' (we already have a newer report of that place).
-- The breakdown (ship and defence counts, building levels, resources) is optional: null = the report did not show it.
create function public.add_scan(p_galaxy int, p_system int, p_position int, p_moon boolean, p_player bigint, p_fleet bigint, p_defense bigint, p_seen_at bigint,
  p_ships jsonb default null, p_defense_units jsonb default null, p_buildings jsonb default null, p_resources bigint default null)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_seen timestamptz := to_timestamp(p_seen_at);
  v public.scans;
  v_ships jsonb := public.clean_counts(p_ships);
  v_def jsonb := public.clean_counts(p_defense_units);
  v_bld jsonb := public.clean_counts(p_buildings);
begin
  if not public.is_member() then raise exception 'not allowed'; end if;
  if p_galaxy not between 1 and 9 or p_system not between 1 and 499 or p_position not between 1 and 15 then raise exception 'Those coordinates do not look right'; end if;
  if p_player is null or p_player < 1 then raise exception 'Missing player'; end if;
  if p_fleet is null or p_defense is null or p_fleet < 0 or p_defense < 0 or p_fleet > 1000000000000000 or p_defense > 1000000000000000 then raise exception 'Those values do not look right'; end if;
  if p_resources is not null and (p_resources < 0 or p_resources > 1000000000000000) then raise exception 'Those values do not look right'; end if;
  if v_seen > now() + interval '1 day' or v_seen < now() - interval '60 days' then raise exception 'That report time does not look right'; end if;
  select * into v from public.scans where galaxy = p_galaxy and system = p_system and position = p_position and moon = coalesce(p_moon, false);
  if not found then
    insert into public.scans (galaxy, system, position, moon, player_id, fleet_value, defense_value, ships, defense_units, buildings, resources, updated_by, observed_at)
    values (p_galaxy, p_system, p_position, coalesce(p_moon, false), p_player, p_fleet, p_defense, v_ships, v_def, v_bld, p_resources, (select auth.uid()), v_seen);
    return 'new';
  end if;
  if v.observed_at >= v_seen then return 'older'; end if;
  update public.scans set player_id = p_player, fleet_value = p_fleet, defense_value = p_defense,
         ships = v_ships, defense_units = v_def, buildings = v_bld, resources = p_resources,
         updated_by = (select auth.uid()), observed_at = v_seen
   where galaxy = p_galaxy and system = p_system and position = p_position and moon = coalesce(p_moon, false);
  return 'updated';
end $$;

revoke execute on function public.add_scan(int, int, int, boolean, bigint, bigint, bigint, bigint, jsonb, jsonb, jsonb, bigint) from public, anon;
grant  execute on function public.add_scan(int, int, int, boolean, bigint, bigint, bigint, bigint, jsonb, jsonb, jsonb, bigint) to authenticated;

delete from public.schema_version;
insert into public.schema_version (version) values (2);

commit;

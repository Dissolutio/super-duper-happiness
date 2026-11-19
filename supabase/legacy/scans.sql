-- Run once in the Supabase SQL Editor. Remembers what spy reports saw on a planet or moon: the value of the ships and of the
-- defence standing there, and when. The map uses it to tell fleet players from turtles. Members can read; writing goes through add_scan().
create table public.scans (
  galaxy        smallint not null check (galaxy between 1 and 7),
  system        smallint not null check (system between 1 and 499),
  position      smallint not null check (position between 1 and 15),
  moon          boolean  not null default false,
  player_id     bigint   not null,
  fleet_value   bigint   not null check (fleet_value >= 0),
  defense_value bigint   not null check (defense_value >= 0),
  updated_by    uuid references public.profiles (id),
  observed_at   timestamptz not null, -- when the report was made
  primary key (galaxy, system, position, moon)
);
create index scans_player_idx on public.scans (player_id);

alter table public.scans enable row level security;
revoke all on public.scans from anon, authenticated;
grant select on public.scans to authenticated;
create policy "members read scans" on public.scans
  for select to authenticated using (public.is_member());

-- Returns 'new', 'updated' or 'older' (we already have a newer report of that place).
create function public.add_scan(p_galaxy int, p_system int, p_position int, p_moon boolean, p_player bigint, p_fleet bigint, p_defense bigint, p_seen_at bigint)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_seen timestamptz := to_timestamp(p_seen_at);
  v public.scans;
begin
  if not public.is_member() then raise exception 'not allowed'; end if;
  if p_galaxy not between 1 and 7 or p_system not between 1 and 499 or p_position not between 1 and 15 then raise exception 'Those coordinates do not look right'; end if;
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

revoke execute on function public.add_scan(int, int, int, boolean, bigint, bigint, bigint, bigint) from public, anon;
grant  execute on function public.add_scan(int, int, int, boolean, bigint, bigint, bigint, bigint) to authenticated;

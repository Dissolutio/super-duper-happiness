-- Run once in the Supabase SQL Editor if you already ran moons.sql before spy reports could update moons.
-- (Fresh installs already get this from moons.sql.) Remembers WHEN each moon fact was true, and adds set_moon_seen() for reports.
alter table public.moons add column observed_at timestamptz not null default now();
update public.moons set observed_at = updated_at;

create or replace function public.set_moon(p_galaxy int, p_system int, p_position int, p_gate boolean, p_phalanx int)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_member() then raise exception 'not allowed'; end if;
  if p_phalanx is not null and (p_phalanx < 0 or p_phalanx > 40) then raise exception 'Phalanx level must be between 0 and 40'; end if;
  if not p_gate and p_phalanx is null then
    delete from public.moons where galaxy = p_galaxy and system = p_system and position = p_position; -- nothing known: forget it
    return;
  end if;
  insert into public.moons (galaxy, system, position, gate, phalanx, updated_by, updated_at, observed_at)
  values (p_galaxy, p_system, p_position, p_gate, p_phalanx, (select auth.uid()), now(), now())
  on conflict (galaxy, system, position) do update
    set gate = excluded.gate, phalanx = excluded.phalanx, updated_by = excluded.updated_by, updated_at = excluded.updated_at, observed_at = excluded.observed_at;
end $$;

-- a spy report on a moon says what it had at that moment. It only counts if it is newer than what we already know.
-- Returns 'new', 'updated', 'same' or 'older'.
create function public.set_moon_seen(p_galaxy int, p_system int, p_position int, p_gate boolean, p_phalanx int, p_seen_at bigint)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_seen timestamptz := to_timestamp(p_seen_at);
  v public.moons;
begin
  if not public.is_member() then raise exception 'not allowed'; end if;
  if p_phalanx is null or p_phalanx < 0 or p_phalanx > 40 then raise exception 'Phalanx level must be between 0 and 40'; end if;
  if v_seen > now() + interval '1 day' or v_seen < now() - interval '60 days' then raise exception 'That report time does not look right'; end if;
  select * into v from public.moons where galaxy = p_galaxy and system = p_system and position = p_position;
  if not found then
    insert into public.moons (galaxy, system, position, gate, phalanx, updated_by, observed_at)
    values (p_galaxy, p_system, p_position, p_gate, p_phalanx, (select auth.uid()), v_seen);
    return 'new';
  end if;
  if v.observed_at >= v_seen then return 'older'; end if;
  update public.moons set gate = p_gate, phalanx = p_phalanx, updated_by = (select auth.uid()), updated_at = now(), observed_at = v_seen
   where galaxy = p_galaxy and system = p_system and position = p_position;
  return case when v.gate = p_gate and v.phalanx is not distinct from p_phalanx then 'same' else 'updated' end;
end $$;

revoke execute on function public.set_moon_seen(int, int, int, boolean, int, bigint) from public, anon;
grant  execute on function public.set_moon_seen(int, int, int, boolean, int, bigint) to authenticated;

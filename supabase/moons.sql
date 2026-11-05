-- Run once in the Supabase SQL Editor (after schema.sql). Adds what we know about moons: jump gates and sensor phalanx levels.
-- Everyone approved can read; changes go through set_moon() so every write is checked. Whoever saved last is recorded.

create table public.moons (
  galaxy     smallint not null check (galaxy between 1 and 7),
  system     smallint not null check (system between 1 and 499),
  position   smallint not null check (position between 1 and 15),
  gate       boolean  not null default false,
  phalanx    smallint check (phalanx between 0 and 40),
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  observed_at timestamptz not null default now(), -- when this was true: the spy report's time, or the save time for typed-in values
  primary key (galaxy, system, position)
);

alter table public.moons enable row level security;
revoke all on public.moons from anon, authenticated;
grant select on public.moons to authenticated;

create policy "members read moons" on public.moons
  for select to authenticated using (public.is_member());

create function public.set_moon(p_galaxy int, p_system int, p_position int, p_gate boolean, p_phalanx int)
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

revoke execute on function public.set_moon(int, int, int, boolean, int) from public, anon;
grant  execute on function public.set_moon(int, int, int, boolean, int) to authenticated;

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

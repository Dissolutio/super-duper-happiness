-- Run in Supabase SQL Editor AFTER schema.sql. Adds player intel: tech learned from pasted spy/combat reports.
--
-- Rules:
--  * One row per in-game player (OGame player id), not per app login. Friends and enemies alike.
--  * A report only overwrites what we know if the report is NEWER than what we already have.
--    It overrides only the values it shows: a report with few probes hides some techs, and those keep their older value.
--  * Members can read; nobody writes directly. Writing goes through add_intel(), which re-checks every value.
--  * Only the small parsed summary is stored, never the raw report page.

create table public.player_intel (
  player_id       bigint primary key,
  name            text not null,
  character_class text,
  -- spy report: tech levels, keyed by OGame tech id (115 combustion, 117 impulse, 118 hyperspace, 109/110/111 weapons/shields/armour, 106 espionage)
  tech            jsonb not null default '{}',
  -- spy report: lifeform ship-speed bonus in percent, keyed by ship id (202 small cargo ... 219 pathfinder)
  speed_bonus     jsonb not null default '{}',
  tech_at         timestamptz,
  -- combat report: weapons/shields/armour in percent as used in that fight
  combat_pct      jsonb not null default '{}',
  combat_at       timestamptz,
  updated_at      timestamptz not null default now()
);

create table public.intel_reports (
  hash        text primary key,                       -- the report's own id (sr-us-265-... / cr-us-265-...), stops double pastes
  kind        text not null check (kind in ('spy', 'combat')),
  observed_at timestamptz not null,
  added_by    uuid not null references public.profiles (id),
  summary     jsonb not null,
  created_at  timestamptz not null default now()
);

alter table public.player_intel enable row level security;
alter table public.intel_reports enable row level security;
revoke all on public.player_intel, public.intel_reports from anon, authenticated;
grant select on public.player_intel, public.intel_reports to authenticated;

create policy "members read intel" on public.player_intel for select to authenticated using (public.is_member());
create policy "members read reports" on public.intel_reports for select to authenticated using (public.is_member());

-- Keep only whitelisted keys with number values inside a range. Anything else in the payload is thrown away.
create function public.clean_numbers(p jsonb, keys text[], lo numeric, hi numeric) returns jsonb
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
  from jsonb_each(case when jsonb_typeof(p) = 'object' then p else '{}'::jsonb end) e
  where e.key = any (keys)
    and jsonb_typeof(e.value) = 'number'
    and (e.value #>> '{}')::numeric between lo and hi
$$;

-- p is the parsed report. Returns 'added', 'duplicate' or 'older' (saved, but a newer report already had the data).
create function public.add_intel(p jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_kind text := p ->> 'kind';
  v_hash text := p ->> 'hash';
  v_at   timestamptz;
  v_id   bigint;
  v_name text;
  m      jsonb;
  v_stale boolean := true;
begin
  if not public.is_member() then raise exception 'not allowed'; end if;
  if v_kind not in ('spy', 'combat') then raise exception 'unknown report type'; end if;
  if v_hash !~ '^(sr|cr)-[a-z]{2}-[0-9]{1,4}-[0-9a-f]{40}$' then raise exception 'bad report id'; end if;
  v_at := to_timestamp((p ->> 'at')::bigint);
  if v_at > now() + interval '1 hour' or v_at < now() - interval '60 days' then raise exception 'report time looks wrong'; end if;
  if char_length(p::text) > 20000 then raise exception 'report too big'; end if;

  if exists (select 1 from public.intel_reports where hash = v_hash) then return 'duplicate'; end if;

  if v_kind = 'spy' then
    v_id := (p ->> 'player_id')::bigint;
    v_name := left(trim(p ->> 'name'), 40);
    if v_id is null or v_id < 1 or v_name is null or v_name = '' then raise exception 'report has no player'; end if;
    insert into public.player_intel as t (player_id, name, character_class, tech, speed_bonus, tech_at)
    values (v_id, v_name, left(p ->> 'class', 30),
            public.clean_numbers(p -> 'tech', array['106','108','109','110','111','115','117','118'], 0, 100),
            public.clean_numbers(p -> 'speed_bonus', array['202','203','204','205','206','207','208','209','210','211','213','214','215','218','219'], -100, 1000),
            v_at)
    on conflict (player_id) do update
      set name = excluded.name, character_class = excluded.character_class,
          tech = t.tech || excluded.tech, speed_bonus = t.speed_bonus || excluded.speed_bonus,  -- a thin report only overrides what it shows
          tech_at = excluded.tech_at, updated_at = now()
      where t.tech_at is null or t.tech_at < excluded.tech_at;
    v_stale := not found;
  else
    for m in select * from jsonb_array_elements(case when jsonb_typeof(p -> 'members') = 'array' then p -> 'members' else '[]'::jsonb end) limit 50 loop
      v_id := (m ->> 'player_id')::bigint;
      v_name := left(trim(m ->> 'name'), 40);
      continue when v_id is null or v_id < 1 or v_name is null or v_name = '';
      insert into public.player_intel as t (player_id, name, combat_pct, combat_at)
      values (v_id, v_name, public.clean_numbers(m -> 'pct', array['weapon','shield','armor'], 0, 2000), v_at)
      on conflict (player_id) do update
        set combat_pct = excluded.combat_pct, combat_at = excluded.combat_at, updated_at = now()
        where t.combat_at is null or t.combat_at < excluded.combat_at;
      if found then v_stale := false; end if;
    end loop;
  end if;

  insert into public.intel_reports (hash, kind, observed_at, added_by, summary)
  values (v_hash, v_kind, v_at, (select auth.uid()), p);
  return case when v_stale then 'older' else 'added' end;
end $$;

revoke execute on function public.add_intel(jsonb) from public, anon;
grant  execute on function public.add_intel(jsonb) to authenticated;
revoke execute on function public.clean_numbers(jsonb, text[], numeric, numeric) from public, anon, authenticated;

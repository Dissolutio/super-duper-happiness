-- 🔄 Migration 3: battles. Combat reports are kept whole, so the Battles screen can replay them round by round.
-- Run once in the SQL Editor after migration 2. Running it again is harmless: it stops at once when battles already exist.

begin;

do $$ begin
  if to_regclass('public.schema_version') is null or (select max(version) from public.schema_version) < 2 then
    raise exception 'Run migrations 0001 and 0002 first, then this file again. Nothing was changed.';
  end if;
  if to_regclass('public.battles') is not null then
    raise exception 'Battles are already set up (this migration has run). Nothing was changed.';
  end if;
end $$;

create table public.battles (
  hash          text primary key check (hash ~ '^cr-[a-z]{2,3}-[0-9]{1,4}-[0-9a-f]{40}$'),
  fought_at     timestamptz not null,
  galaxy        smallint not null check (galaxy between 1 and 9),
  system        smallint not null check (system between 1 and 499),
  position      smallint not null check (position between 1 and 16),
  winner        text not null check (winner in ('attacker', 'defender', 'draw')),
  attacker_tags text[] not null default '{}', -- alliance tags of the attacking fleets
  defender_tags text[] not null default '{}',
  lost_attacker bigint not null default 0 check (lost_attacker >= 0), -- value of units lost (resources)
  lost_defender bigint not null default 0 check (lost_defender >= 0),
  data          jsonb not null check (jsonb_typeof(data) = 'object' and octet_length(data::text) < 200000), -- the whole battle, see public/battle-parse.js
  added_by      uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  created_at    timestamptz not null default now()
);
create index battles_fought_at on public.battles (fought_at desc);

alter table public.battles enable row level security;
revoke all on public.battles from anon, authenticated;
grant select, delete on public.battles to authenticated;
create policy "members read battles" on public.battles
  for select to authenticated using (public.is_member());
create policy "members delete their own battles" on public.battles
  for delete to authenticated using (public.is_member() and added_by = (select auth.uid()));

-- Saves a battle from a combat report (the object public/battle-parse.js makes). Returns 'added' or 'duplicate'.
-- The detail goes in as data and is only ever shown escaped; the columns used for lists and filters are checked here.
create function public.add_battle(p jsonb)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_hash text := p ->> 'hash';
  v_at numeric;
  v_c text[] := string_to_array(p ->> 'coords', ':');
  v_tags_a text[];
  v_tags_d text[];
  v_lost_a numeric;
  v_lost_d numeric;
begin
  if not public.is_member() then raise exception 'not allowed'; end if;
  if p is null or jsonb_typeof(p) <> 'object' or octet_length(p::text) >= 200000 then raise exception 'That battle does not look right'; end if;
  if v_hash is null or v_hash !~ '^cr-[a-z]{2,3}-[0-9]{1,4}-[0-9a-f]{40}$' then raise exception 'That battle has no valid report id'; end if;
  if jsonb_typeof(p -> 'at') <> 'number' or jsonb_typeof(p -> 'fleets') <> 'array' or jsonb_typeof(p -> 'rounds') <> 'array'
     or jsonb_array_length(p -> 'fleets') not between 2 and 64 or jsonb_array_length(p -> 'rounds') > 6 then
    raise exception 'That battle does not look right';
  end if;
  if coalesce(array_length(v_c, 1), 0) <> 3 or v_c[1] !~ '^[1-9]$' or v_c[2] !~ '^[0-9]{1,3}$' or v_c[3] !~ '^[0-9]{1,2}$' then raise exception 'Those coordinates do not look right'; end if;
  v_at := (p ->> 'at')::numeric;
  if to_timestamp(v_at) > now() + interval '1 day' or to_timestamp(v_at) < now() - interval '365 days' then raise exception 'That report time does not look right'; end if;
  if coalesce(p ->> 'winner', '') not in ('attacker', 'defender', 'draw') then raise exception 'That battle does not look right'; end if;
  select coalesce(array_agg(distinct left(f ->> 'tag', 12)) filter (where coalesce(f ->> 'tag', '') <> ''), '{}') into v_tags_a from jsonb_array_elements(p -> 'fleets') f where f ->> 'side' = 'a';
  select coalesce(array_agg(distinct left(f ->> 'tag', 12)) filter (where coalesce(f ->> 'tag', '') <> ''), '{}') into v_tags_d from jsonb_array_elements(p -> 'fleets') f where f ->> 'side' = 'd';
  v_lost_a := case when jsonb_typeof(p -> 'lost' -> 'a') = 'number' then (p -> 'lost' ->> 'a')::numeric else 0 end;
  v_lost_d := case when jsonb_typeof(p -> 'lost' -> 'd') = 'number' then (p -> 'lost' ->> 'd')::numeric else 0 end;
  if v_lost_a not between 0 and 1e16 or v_lost_d not between 0 and 1e16 then raise exception 'That battle does not look right'; end if;
  insert into public.battles (hash, fought_at, galaxy, system, position, winner, attacker_tags, defender_tags, lost_attacker, lost_defender, data, added_by)
  values (v_hash, to_timestamp(v_at), v_c[1]::smallint, v_c[2]::smallint, v_c[3]::smallint, p ->> 'winner', v_tags_a, v_tags_d, round(v_lost_a), round(v_lost_d), p, (select auth.uid()))
  on conflict (hash) do nothing;
  return case when found then 'added' else 'duplicate' end;
end $$;

revoke execute on function public.add_battle(jsonb) from public, anon;
grant  execute on function public.add_battle(jsonb) to authenticated;

delete from public.schema_version;
insert into public.schema_version (version) values (3);

commit;

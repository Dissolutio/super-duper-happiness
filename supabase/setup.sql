-- 🗄️  WAR ROOM DATABASE: complete setup for a NEW Supabase project. Run it ONCE.
-- Supabase dashboard > SQL Editor > New query > paste this whole file > Run. "Success. No rows returned" = done.
--
-- What it makes: member profiles (invite-only, approval needed), chat, flights, push alerts, player intel from spy and
-- combat reports, moons (gates, phalanx), scans and battles. Every table has Row-Level Security: not logged in = nothing,
-- logged in but not approved = nothing, approved member = read, and writes only through checked functions.
--
-- Already have a War Room database? Do NOT run this. Run the files in supabase/migrations/ that are newer than
-- your version instead (see the README, "Updating"). Check your version with:  select version from public.schema_version;
--
-- After running it: invite yourself (Authentication > Users > Invite user), set your password from the email, then run
-- the "make yourself admin" lines at the bottom of this file, with your email.

begin;

-- ============================================================ 1. members
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 32),
  approved     boolean not null default false,
  is_admin     boolean not null default false,
  created_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- New auth user -> new profile (unapproved). Name defaults to the part of the email before the @.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(split_part(new.email, '@', 1), 32));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- "Is the caller an approved member?" Used by policies now and by chat tables later.
create function public.is_member() returns boolean
language sql security definer stable set search_path = '' as $$
  select coalesce((select approved from public.profiles where id = (select auth.uid())), false)
$$;

-- Nobody can call these directly through the API.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.is_member()       from public, anon;
grant  execute on function public.is_member()       to authenticated;

-- Table privileges: not logged in = nothing. Logged in = read, and change your own display_name only.
-- (Column-level grant means approved / is_admin can't be edited from the app, even by the owner of the row.)
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

-- Row rules on top of the privileges above.
create policy "read own profile" on public.profiles
  for select to authenticated using (id = (select auth.uid()));

create policy "members read approved members" on public.profiles
  for select to authenticated using (public.is_member() and approved);

create policy "edit own profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- ============================================================ 2. chat
create table public.channels (
  slug text primary key,
  name text not null
);
insert into public.channels (slug, name) values ('general', 'General'), ('targets', 'Targets');

create table public.messages (
  id         bigint generated always as identity primary key,
  channel    text not null references public.channels (slug),
  author     uuid not null default auth.uid() references public.profiles (id),
  body       text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index messages_channel_id on public.messages (channel, id desc);

alter table public.channels enable row level security;
alter table public.messages enable row level security;

-- Privileges. On insert the app may only choose the channel and the text; the author is filled in
-- from the login (default above) and the policy below insists it is really you.
revoke all on public.channels, public.messages from anon, authenticated;
grant select on public.channels to authenticated;
grant select on public.messages to authenticated;
grant insert (channel, body) on public.messages to authenticated;

create policy "members read channels" on public.channels
  for select to authenticated using (public.is_member());

create policy "members read messages" on public.messages
  for select to authenticated using (public.is_member());

create policy "members post as themselves" on public.messages
  for insert to authenticated
  with check (public.is_member() and author = (select auth.uid()));

-- Remove a message (admin, in the SQL editor):  delete from public.messages where id = 123;
-- More channels later:  insert into public.channels (slug, name) values ('fleetsave', 'Fleetsave');

-- ============================================================ 3. flights (table still named "landings" for older pages)
create table public.landings (
  id         bigint generated always as identity primary key,
  author     uuid not null references public.profiles (id),
  side       text not null check (side in ('ours', 'theirs', 'move')),  -- ours = our attack, theirs = enemy incoming, move = our own fleet moving to our own planet
  galaxy     smallint not null check (galaxy between 1 and 9),
  system     smallint not null check (system between 1 and 499),
  position   smallint not null check (position between 1 and 16),  -- 16 = deep space (expeditions)
  strength   text not null check (char_length(strength) between 1 and 40),
  arrives_at timestamptz not null,
  created_at timestamptz not null default now(),
  mission    text not null default 'attack'
    check (mission in ('attack','acs_attack','acs_defend','transport','deploy','espionage','harvest','expedition','moon_destruction','colonize','return')),
  category   text not null default 'info' check (category in ('info','opportunity','alert')),
  origin_galaxy   smallint check (origin_galaxy between 1 and 9),
  origin_system   smallint check (origin_system between 1 and 499),
  origin_position smallint check (origin_position between 1 and 15),
  returns_at timestamptz,
  source     text check (source in ('event','phalanx','probe','ally')),
  constraint landings_origin_all_or_none check (
    (origin_galaxy is null and origin_system is null and origin_position is null)
    or (origin_galaxy is not null and origin_system is not null and origin_position is not null)),
  constraint landings_returns_after_arrival check (returns_at is null or returns_at > arrives_at)
);
create index landings_arrives_at on public.landings (arrives_at);
create index landings_returns_at on public.landings (returns_at) where returns_at is not null;

alter table public.landings enable row level security;

-- Table privileges: read, and delete (own rows only, see policy). Inserting goes through add_landing() only.
revoke all on public.landings from anon, authenticated;
grant select, delete on public.landings to authenticated;

create policy "members read landings" on public.landings
  for select to authenticated using (public.is_member());

create policy "remove own landing" on public.landings
  for delete to authenticated using (public.is_member() and author = (select auth.uid()));

-- the old way in, kept for pages that have not updated yet; enemy incoming is an alert
create function public.add_landing(
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

revoke execute on function public.add_landing(text, int, int, int, text, int) from public, anon;
grant  execute on function public.add_landing(text, int, int, int, text, int) to authenticated;

-- Remove anyone's landing (admin, in the SQL editor):  delete from public.landings where id = 5;

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

-- ============================================================ 4. push alerts
create table public.push_subscriptions (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  endpoint   text not null unique check (endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/' and char_length(endpoint) <= 700),
  p256dh     text not null check (p256dh ~ '^[A-Za-z0-9_-]{87}$'),   -- 65-byte public key, base64url
  auth       text not null check (auth ~ '^[A-Za-z0-9_-]{22}$'),     -- 16-byte secret, base64url
  on_enemy   boolean not null default true,   -- enemy incoming landings
  on_ours    boolean not null default true,   -- our attacks and fleet moves
  on_mention boolean not null default true,   -- someone writes @yourname in chat
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
grant select, delete on public.push_subscriptions to authenticated;

create policy "see own devices" on public.push_subscriptions
  for select to authenticated using (public.is_member() and user_id = (select auth.uid()));
create policy "remove own devices" on public.push_subscriptions
  for delete to authenticated using (user_id = (select auth.uid()));

create function public.save_push(p_endpoint text, p_p256dh text, p_auth text, p_enemy boolean, p_ours boolean, p_mention boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_member() then raise exception 'not allowed'; end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, on_enemy, on_ours, on_mention)
  values ((select auth.uid()), p_endpoint, p_p256dh, p_auth, p_enemy, p_ours, p_mention)
  on conflict (endpoint) do update   -- same device again (new settings, or a different person now using this browser)
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
        on_enemy = excluded.on_enemy, on_ours = excluded.on_ours, on_mention = excluded.on_mention;
end $$;

revoke execute on function public.save_push(text, text, text, boolean, boolean, boolean) from public, anon;
grant  execute on function public.save_push(text, text, text, boolean, boolean, boolean) to authenticated;

-- Which landings/messages already caused a notification, so asking twice never sends twice. Only the server touches this.
create table public.push_log (
  kind       text not null check (kind in ('landing', 'message')),
  ref_id     bigint not null,
  created_at timestamptz not null default now(),
  primary key (kind, ref_id)
);
alter table public.push_log enable row level security;   -- no policies and no grants: members cannot see or write it
revoke all on public.push_log from anon, authenticated;

-- ============================================================ 5. player intel from reports
create table public.player_intel (
  player_id       bigint primary key,
  name            text not null,
  character_class text,
  -- spy report: tech levels, keyed by OGame tech id (115 combustion, 117 impulse, 118 hyperspace, 109/110/111 weapons/shields/armour, 106 espionage)
  tech            jsonb not null default '{}',
  -- spy report: lifeform ship-speed bonus in percent, keyed by ship id (202 small cargo ... 219 pathfinder)
  speed_bonus     jsonb not null default '{}',
  tech_at         timestamptz,
  tech_via        text,        -- 'html' (page pasted from the game) or 'id' (looked up from a report id, third-party service)
  -- combat report: weapons/shields/armour in percent as used in that fight
  combat_pct      jsonb not null default '{}',
  combat_at       timestamptz,
  combat_via      text,
  updated_at      timestamptz not null default now()
);

create table public.intel_reports (
  hash        text primary key,                       -- the report's own id (sr-<community>-<server>-... / cr-...), stops double pastes
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
  v_via  text := coalesce(p ->> 'via', 'html');
begin
  if not public.is_member() then raise exception 'not allowed'; end if;
  if v_kind not in ('spy', 'combat') then raise exception 'unknown report type'; end if;
  if v_hash !~ '^(sr|cr)-[a-z]{2}-[0-9]{1,4}-[0-9a-f]{40}$' then raise exception 'bad report id'; end if;
  v_at := to_timestamp((p ->> 'at')::bigint);
  if v_at > now() + interval '1 hour' or v_at < now() - interval '60 days' then raise exception 'report time looks wrong'; end if;
  if v_via not in ('html', 'id') then raise exception 'bad source'; end if;
  if char_length(p::text) > 20000 then raise exception 'report too big'; end if;

  if exists (select 1 from public.intel_reports where hash = v_hash) then return 'duplicate'; end if;

  if v_kind = 'spy' then
    v_id := (p ->> 'player_id')::bigint;
    v_name := left(trim(p ->> 'name'), 40);
    if v_id is null or v_id < 1 or v_name is null or v_name = '' then raise exception 'report has no player'; end if;
    insert into public.player_intel as t (player_id, name, character_class, tech, speed_bonus, tech_at, tech_via)
    values (v_id, v_name, left(p ->> 'class', 30),
            public.clean_numbers(p -> 'tech', array['106','108','109','110','111','115','117','118'], 0, 100),
            public.clean_numbers(p -> 'speed_bonus', array['202','203','204','205','206','207','208','209','210','211','213','214','215','218','219'], -100, 1000),
            v_at, v_via)
    on conflict (player_id) do update
      set name = excluded.name, character_class = excluded.character_class,
          tech = t.tech || excluded.tech, speed_bonus = t.speed_bonus || excluded.speed_bonus,  -- a thin report only overrides what it shows
          tech_at = excluded.tech_at, tech_via = excluded.tech_via, updated_at = now()
      where t.tech_at is null or t.tech_at < excluded.tech_at;
    v_stale := not found;
  else
    for m in select * from jsonb_array_elements(case when jsonb_typeof(p -> 'members') = 'array' then p -> 'members' else '[]'::jsonb end) limit 50 loop
      v_id := (m ->> 'player_id')::bigint;
      v_name := left(trim(m ->> 'name'), 40);
      continue when v_id is null or v_id < 1 or v_name is null or v_name = '';
      insert into public.player_intel as t (player_id, name, combat_pct, combat_at, combat_via)
      values (v_id, v_name, public.clean_numbers(m -> 'pct', array['weapon','shield','armor'], 0, 2000), v_at, v_via)
      on conflict (player_id) do update
        set combat_pct = excluded.combat_pct, combat_at = excluded.combat_at, combat_via = excluded.combat_via, updated_at = now()
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

-- ============================================================ 6. moons: jump gates and sensor phalanx
create table public.moons (
  galaxy     smallint not null check (galaxy between 1 and 9),
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

-- ============================================================ 7. scans: ships and defence seen by spy reports
create table public.scans (
  galaxy        smallint not null check (galaxy between 1 and 9),
  system        smallint not null check (system between 1 and 499),
  position      smallint not null check (position between 1 and 15),
  moon          boolean  not null default false,
  player_id     bigint   not null,
  fleet_value   bigint   not null check (fleet_value >= 0),
  defense_value bigint   not null check (defense_value >= 0),
  updated_by    uuid references public.profiles (id),
  observed_at   timestamptz not null, -- when the report was made
  ships         jsonb,  -- { ship id: count } when the report showed them (null = not shown)
  defense_units jsonb,  -- { defence id: count }
  buildings     jsonb,  -- { building id: level }
  resources     bigint, -- metal + crystal + deuterium on the planet
  primary key (galaxy, system, position, moon)
);
create index scans_player_idx on public.scans (player_id);

alter table public.scans enable row level security;
revoke all on public.scans from anon, authenticated;
grant select on public.scans to authenticated;
create policy "members read scans" on public.scans
  for select to authenticated using (public.is_member());

-- { "id": count } maps from reports (ships, defence, building levels): only small whole numbers under number keys get in.
create function public.clean_counts(p jsonb) returns jsonb
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

-- ============================================================ 8. battles from combat reports
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

-- ============================================================ 9. version, for updates (see supabase/migrations/)
create table public.schema_version (version int not null, updated_at timestamptz not null default now());
alter table public.schema_version enable row level security; -- no grants: only the SQL editor sees it
revoke all on public.schema_version from anon, authenticated;
insert into public.schema_version (version) values (3);

commit;

-- ---------------------------------------------------------------------------
-- 👑 AFTER you have invited yourself and set your password, make yourself approved + admin
-- (put your email between the quotes, then run just these lines):
--
--   update public.profiles set approved = true, is_admin = true
--   where id = (select id from auth.users where email = 'YOUR_EMAIL_HERE');
--
-- ✅ Approve a player later:
--
--   update public.profiles set approved = true
--   where id = (select id from auth.users where email = 'THEIR_EMAIL_HERE');
--
-- 🚪 Lock someone out: set approved = false (or delete them under Authentication > Users).
-- ---------------------------------------------------------------------------

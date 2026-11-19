-- Run once in the Supabase SQL Editor if you already ran flights.sql before "return" existed.
-- (Fresh installs already get this from flights.sql.) Adds "return" as a mission: a fleet coming back to a planet.
alter table public.landings drop constraint landings_mission_check;
alter table public.landings add constraint landings_mission_check
  check (mission in ('attack','acs_attack','acs_defend','transport','deploy','espionage','harvest','expedition','moon_destruction','colonize','return'));

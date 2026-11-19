-- Run once in the Supabase SQL Editor if you already ran landings.sql before "fleet move" existed.
-- (Fresh installs already get this from landings.sql.) Allows a third kind of landing: our own fleet moving to our own planet.
alter table public.landings drop constraint landings_side_check;
alter table public.landings add constraint landings_side_check check (side in ('ours', 'theirs', 'move'));

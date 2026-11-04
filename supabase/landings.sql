-- Run in Supabase SQL Editor AFTER schema.sql. Adds fleet landings (pinned at the top of the Targets channel).
--
-- Members add a landing through the add_landing() function, which uses the SERVER's clock
-- (arrival = now + minutes), so a phone with a wrong clock can't skew it. Members can remove their own.

create table public.landings (
  id         bigint generated always as identity primary key,
  author     uuid not null references public.profiles (id),
  side       text not null check (side in ('ours', 'theirs', 'move')),  -- ours = our attack, theirs = enemy incoming, move = our own fleet moving to our own planet
  galaxy     smallint not null check (galaxy between 1 and 7),
  system     smallint not null check (system between 1 and 499),
  position   smallint not null check (position between 1 and 15),
  strength   text not null check (char_length(strength) between 1 and 40),
  arrives_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index landings_arrives_at on public.landings (arrives_at);

alter table public.landings enable row level security;

-- Table privileges: read, and delete (own rows only, see policy). Inserting goes through add_landing() only.
revoke all on public.landings from anon, authenticated;
grant select, delete on public.landings to authenticated;

create policy "members read landings" on public.landings
  for select to authenticated using (public.is_member());

create policy "remove own landing" on public.landings
  for delete to authenticated using (public.is_member() and author = (select auth.uid()));

create function public.add_landing(
  p_side text, p_galaxy int, p_system int, p_position int, p_strength text, p_minutes int
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_member() then raise exception 'not allowed'; end if;
  if p_minutes is null or p_minutes < 1 or p_minutes > 10080 then
    raise exception 'Arrival must be between 1 minute and 7 days from now';
  end if;
  insert into public.landings (author, side, galaxy, system, position, strength, arrives_at)
  values ((select auth.uid()), p_side, p_galaxy, p_system, p_position, trim(p_strength),
          now() + make_interval(mins => p_minutes));
end $$;

revoke execute on function public.add_landing(text, int, int, int, text, int) from public, anon;
grant  execute on function public.add_landing(text, int, int, int, text, int) to authenticated;

-- Remove anyone's landing (admin, in the SQL editor):  delete from public.landings where id = 5;

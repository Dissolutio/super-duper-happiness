-- Run this in Supabase: SQL Editor -> New query -> paste -> Run. Safe to read first, it only creates the profiles table.
--
-- Model: only people YOU invite can have an account (public sign-ups are off in the dashboard).
-- Every account gets a profile row that starts unapproved. Unapproved accounts can log in but see nothing.
-- Approving someone / making an admin is done by you in the SQL editor (see bottom). Users can never do it themselves.

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

-- ---------------------------------------------------------------------------
-- AFTER you have invited yourself and set your password, make yourself approved + admin:
--
--   update public.profiles set approved = true, is_admin = true
--   where id = (select id from auth.users where email = 'YOUR_EMAIL_HERE');
--
-- Approve a player later:
--
--   update public.profiles set approved = true
--   where id = (select id from auth.users where email = 'THEIR_EMAIL_HERE');
--
-- Lock someone out: set approved = false (or delete them under Authentication -> Users).
-- ---------------------------------------------------------------------------

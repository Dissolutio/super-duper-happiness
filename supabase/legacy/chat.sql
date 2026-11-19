-- Run in Supabase SQL Editor AFTER schema.sql. Adds chat channels + messages.
--
-- Rules: only approved members can read or post. You can only post as yourself. Nobody can edit or delete
-- through the app (admins fix things in the SQL editor). Not logged in = no access at all.

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

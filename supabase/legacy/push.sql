-- Run in Supabase SQL Editor AFTER schema.sql, chat.sql and landings.sql. Adds phone/desktop notifications (web push).
--
-- A "subscription" is one device's address for push messages (a browser endpoint plus two keys). Members can see and delete
-- only their own. Saving goes through save_push(), which checks every value, including that the endpoint belongs to a real
-- push service. That check matters: our server will POST to these addresses, so nobody may store an address of their choosing.
-- The server (a Netlify function) reads everyone's subscriptions with the secret key, which only it has.

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

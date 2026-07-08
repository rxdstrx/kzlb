-- ============================================================
-- Fix 1: forum_upvotes has the WRONG schema.
-- It currently stores a "thread_id" integer column, but the app
-- code (and forum_likes, which already works) uses a "target_id"
-- text column ("t_123" for threads, "r_456" for replies) so a
-- single table can track upvotes on both threads and replies.
-- This mismatch is why upvotes never actually saved anywhere.
-- ============================================================
alter table public.forum_upvotes add column if not exists target_id text;

-- migrate any existing rows (created under the old schema) to the new shape
update public.forum_upvotes
set target_id = 't_' || thread_id::text
where target_id is null and thread_id is not null;

alter table public.forum_upvotes alter column target_id set not null;
alter table public.forum_upvotes drop column if exists thread_id;

-- one upvote per player per target, matching forum_likes' constraint
create unique index if not exists forum_upvotes_steamid_target_unique
  on public.forum_upvotes (steamid, target_id);

-- ============================================================
-- Fix 2: forum_notifications has NO grants for the anon role at
-- all, so the client-side insert that fires on every like/upvote/
-- reply was silently rejected (permission denied) — no row was
-- ever created, so there was nothing to notify about.
-- ============================================================
grant select, insert on public.forum_notifications to anon;

-- if RLS is enabled on this table, make sure a permissive policy
-- exists (the app authenticates via Steam, not Supabase Auth, so
-- access control happens in application code, same as the
-- existing "notifications" table)
alter table public.forum_notifications enable row level security;

drop policy if exists "forum_notifications_anon_all" on public.forum_notifications;
create policy "forum_notifications_anon_all"
  on public.forum_notifications
  for all
  using (true)
  with check (true);

-- ============================================================
-- Fix 3: add forum_notifications to the realtime publication so
-- likes/upvotes/replies push live to the bell instead of only
-- refreshing on the 45s poll (matches how "notifications" already
-- works for friend-accepted events).
-- ============================================================
alter publication supabase_realtime add table public.forum_notifications;

-- ============================================================
-- Fix 4: the vote SAVES (forum_upvotes insert works) but the
-- visible counter never moves. Cause: anon has column-level
-- UPDATE grants on forum_threads/forum_replies that only cover
-- "likes"/"reply_count" (granted when those columns were added) —
-- "upvotes" was added later and never got the same grant, so the
-- PATCH that writes the new count silently fails with 401.
-- ============================================================
grant update (upvotes) on public.forum_threads to anon;
grant update (upvotes) on public.forum_replies to anon;

-- ============================================================
-- Fix 5: forum_notifications INSERT still failed after fix 2 with
-- "permission denied for sequence forum_notifications_id_seq".
-- Granting INSERT on a table does NOT automatically grant usage of
-- its identity/serial sequence — that needs its own grant.
-- ============================================================
grant usage, select on sequence public.forum_notifications_id_seq to anon;

-- ============================================================
-- Fix 6: sending a friend request / accepting one doesn't show up
-- live for the other person (they have to refresh). Cause:
-- "friend_requests" was never added to the realtime publication,
-- so Postgres never streams its INSERT/UPDATE events over the
-- websocket — the client's realtime subscription connects fine
-- (so it never falls back to polling either), it just never
-- receives anything for this table. Wrapped in a check so this is
-- safe to run again even if it's already been added.
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'friend_requests'
  ) then
    execute 'alter publication supabase_realtime add table public.friend_requests';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    execute 'alter publication supabase_realtime add table public.notifications';
  end if;
end $$;

-- ============================================================
-- Fix 7 (the real cause of "no upvote/like notification ever
-- appears in the bell"): the backend endpoint (api/friend-action.js
-- action=get-notifications) reads forum_notifications using the
-- SERVICE ROLE key, not anon. Fix 2 only granted anon SELECT/INSERT
-- — service_role had NO grant at all on this table, so its query
-- returned 403 "permission denied for table forum_notifications"
-- every single time, and the endpoint silently degraded to
-- friend-only notifications (by design, so one broken query
-- wouldn't take down the whole bell) instead of surfacing the error.
-- Confirmed directly via the API response's forumDebug field.
-- ============================================================
grant select, insert, update, delete on public.forum_notifications to service_role;
grant usage, select on sequence public.forum_notifications_id_seq to service_role;

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

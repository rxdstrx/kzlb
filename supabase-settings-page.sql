-- ============================================================
-- Settings page — new columns.
--
-- Nickname lives on `players` (the same column already shown on the
-- leaderboard/forum/profile everywhere), so changing it in Settings
-- updates the site instantly with zero extra wiring. It needs the same
-- "manual lock" pattern we already use for country_manual, so the
-- scraper/scrape-top100 jobs don't silently overwrite a chosen nickname
-- back to whatever Cybershoke/Steam reports.
-- ============================================================
alter table public.players add column if not exists nickname_manual boolean not null default false;
alter table public.players add column if not exists nickname_updated_at timestamptz;

-- ============================================================
-- Everything else is personal/private settings, not leaderboard data —
-- lives on player_profiles (already used for banner_url) instead of
-- polluting the scrape-owned `players` table.
--
-- Deliberately NOT granting anon any access to these columns: email and
-- trade_link are private, so reads/writes only ever go through the
-- JWT-authenticated api/get-settings.js and api/update-settings.js
-- endpoints (service_role key), never a direct client-side anon query.
-- ============================================================
alter table public.player_profiles add column if not exists email text;
alter table public.player_profiles add column if not exists show_location boolean not null default true;
alter table public.player_profiles add column if not exists language text not null default 'en';
alter table public.player_profiles add column if not exists trade_link text;
-- Confidentiality tab — stored now, enforcement comes later (per your note).
alter table public.player_profiles add column if not exists safe_talking boolean not null default true;
alter table public.player_profiles add column if not exists hide_online boolean not null default false;
alter table public.player_profiles add column if not exists hide_inventory boolean not null default false;

-- service_role needs write access to both tables' new columns — grant
-- defensively (we've hit missing service_role grants on other tables before).
grant select, update (nickname_manual, nickname_updated_at) on public.players to service_role;
grant select, update (email, show_location, language, trade_link, safe_talking, hide_online, hide_inventory)
  on public.player_profiles to service_role;
grant insert on public.player_profiles to service_role;

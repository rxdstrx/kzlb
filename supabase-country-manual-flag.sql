-- ============================================================
-- Root cause of "my flag reverts after update/scrape": several
-- scripts re-detect a player's country from Faceit/Steam and
-- silently overwrite whatever is in Supabase, with no way to know
-- a human deliberately picked a different flag via the profile
-- page or the admin panel. This column records that intent so
-- every auto-detection path can check it and back off.
-- ============================================================
alter table public.players add column if not exists country_manual boolean not null default false;

-- service_role writes this column from change-flag.js / admin-action.js —
-- grant defensively in case this table doesn't already have blanket
-- service_role privileges (we've hit this gap before on other tables).
grant select, update (country_manual) on public.players to service_role;

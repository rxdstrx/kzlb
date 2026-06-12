// auth.js — Steam login state management, runs on every page
// ─────────────────────────────────────────────────────────────

// ── Shared display helpers (used by all leaderboard pages) ──

// Format global rank: null/0/9999+ → '—', otherwise '#1,234'
function fmtPlace(kz_place) {
  const v = Number(kz_place);
  if (!kz_place || v === 0 || v === 9999) return '—';
  return '#' + v.toLocaleString();
}

// Format maps done: always returns a string like '14 (8%)' or '0 (0%)'
function fmtMaps(kz_maps, maps_list) {
  if (kz_maps && kz_maps !== '0' && kz_maps !== 0) return String(kz_maps);
  const count = (maps_list || []).length;
  return count > 0 ? String(count) : '0 (0%)';
}

function parseJWTPayload(token) {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  } catch { return null; }
}

function getAuth() {
  const token    = localStorage.getItem('kz_steam_token');
  const steamid  = localStorage.getItem('kz_steam_id');
  const nickname = localStorage.getItem('kz_steam_nick');
  const avatar   = localStorage.getItem('kz_steam_avatar');
  if (!token || !steamid) return null;
  const payload = parseJWTPayload(token);
  if (!payload || payload.exp < Math.floor(Date.now() / 1000)) {
    clearAuth();
    return null;
  }
  const country = localStorage.getItem('kz_country') || '';
  return { token, steamid, nickname, avatar, country };
}

function clearAuth() {
  const steamid = localStorage.getItem('kz_steam_id');
  if (steamid) localStorage.removeItem(`kz_registered_${steamid}`);
  localStorage.removeItem('kz_steam_token');
  localStorage.removeItem('kz_steam_id');
  localStorage.removeItem('kz_steam_nick');
  localStorage.removeItem('kz_steam_avatar');
  localStorage.removeItem('kz_country');
}

const SB_EDGE    = 'https://btcufotfvfnuoiokghjm.supabase.co/functions/v1';
const SB_ANON_AUTH = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0Y3Vmb3RmdmZudW9pb2tnaGptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwODEzMTcsImV4cCI6MjA5NjY1NzMxN30.hj_whZDtPhqfC-5ktGvLfqoMBp_x3G8w3lv5IcBdCX4';

// Register/update player via Supabase Edge Function — instant (~2s)
function updateLastSeen(steamid) {
  fetch(`https://btcufotfvfnuoiokghjm.supabase.co/rest/v1/players?steamid=eq.${steamid}`, {
    method: 'PATCH',
    headers: { apikey: SB_ANON_AUTH, Authorization: `Bearer ${SB_ANON_AUTH}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ last_seen: new Date().toISOString() }),
  }).catch(() => {});
}

function triggerAddPlayer(steamid) {
  const key  = `kz_registered_${steamid}`;
  const last = parseInt(localStorage.getItem(key) || '0', 10);
  const now  = Date.now();
  if (now - last < 10 * 60 * 1000) return;
  localStorage.setItem(key, String(now));

  // Check if player already exists in Supabase
  fetch(`https://btcufotfvfnuoiokghjm.supabase.co/rest/v1/players?steamid=eq.${steamid}&select=steamid,nickname,avatar,country&limit=1`, {
    headers: { apikey: SB_ANON_AUTH, Authorization: `Bearer ${SB_ANON_AUTH}` }
  })
  .then(r => r.json())
  .then(rows => {
    if (rows && rows.length > 0) {
      // Already exists — update local storage then refresh stats in background
      const p = rows[0];
      if (p.nickname) localStorage.setItem('kz_steam_nick', p.nickname);
      if (p.avatar)   localStorage.setItem('kz_steam_avatar', p.avatar);
      if (p.country && p.country !== 'xx') localStorage.setItem('kz_country', p.country);
      updateNavAuth();
      fetch(`${SB_EDGE}/update-player`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SB_ANON_AUTH}` },
        body: JSON.stringify({ steamid }),
      }).then(r => r.json()).then(d => {
        if (d?.ok) {
          if (d.nickname) localStorage.setItem('kz_steam_nick', d.nickname);
          if (d.avatar)   localStorage.setItem('kz_steam_avatar', d.avatar);
          updateNavAuth();
        }
      }).catch(() => {});
    } else {
      // New player — scrape instantly via Edge Function (~2s)
      fetch(`${SB_EDGE}/scrape-player`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SB_ANON_AUTH}` },
        body: JSON.stringify({ steamid }),
      })
      .then(r => r.json())
      .then(d => {
        if (d?.ok) {
          if (d.nickname) localStorage.setItem('kz_steam_nick', d.nickname);
          if (d.avatar)   localStorage.setItem('kz_steam_avatar', d.avatar);
          updateNavAuth();
          // Also trigger Vercel register for country detection
          fetch(`https://kzlb.vercel.app/api/register-player?steamid=${steamid}`)
            .then(r => r.ok ? r.json() : null)
            .then(reg => {
              if (reg?.country && reg.country !== 'xx') {
                localStorage.setItem('kz_country', reg.country);
                // Update country in Supabase
                fetch(`https://btcufotfvfnuoiokghjm.supabase.co/rest/v1/players?steamid=eq.${steamid}`, {
                  method: 'PATCH',
                  headers: { apikey: SB_ANON_AUTH, Authorization: `Bearer ${SB_ANON_AUTH}`, 'Content-Type': 'application/json' },
                  body: JSON.stringify({ country: reg.country }),
                }).catch(() => {});
              }
            }).catch(() => {});
        }
      }).catch(() => {});
    }
  }).catch(() => {
    // Fallback to old Vercel method
    fetch(`https://kzlb.vercel.app/api/register-player?steamid=${steamid}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.country && d.country !== 'xx') localStorage.setItem('kz_country', d.country);
        if (d?.nickname) localStorage.setItem('kz_steam_nick', d.nickname);
        if (d?.avatar)   localStorage.setItem('kz_steam_avatar', d.avatar);
        updateNavAuth();
      }).catch(() => {});
  });
}

// Fetch avatar/nickname from Steam Vercel proxy
function fetchSteamProfile(steamid) {
  return fetch(`https://kzlb.vercel.app/api/steam-user?steamid=${steamid}`)
    .then(r => r.json())
    .then(d => {
      if (d.nickname) localStorage.setItem('kz_steam_nick', d.nickname);
      if (d.avatar)   localStorage.setItem('kz_steam_avatar', d.avatar);
      if (d.country && d.country !== 'xx') localStorage.setItem('kz_country', d.country);
    }).catch(() => {});
}

// ── Handle token arriving in URL hash after Steam login (#token=JWT:STEAMID) ──
(function handleHashToken() {
  const hash = window.location.hash;
  if (!hash.startsWith('#token=')) return;
  const raw      = hash.slice(7);
  const colonIdx = raw.lastIndexOf(':');
  if (colonIdx === -1) return;
  const token   = raw.slice(0, colonIdx);
  const steamid = raw.slice(colonIdx + 1);
  const payload = parseJWTPayload(token);

  if (payload && payload.steamid === steamid) {
    // If switching accounts, clear stale nick/avatar from the old account
    const prevSteamid = localStorage.getItem('kz_steam_id');
    if (prevSteamid && prevSteamid !== steamid) {
      localStorage.removeItem('kz_steam_nick');
      localStorage.removeItem('kz_steam_avatar');
      if (prevSteamid) localStorage.removeItem(`kz_registered_${prevSteamid}`);
    }

    localStorage.setItem('kz_steam_token', token);
    localStorage.setItem('kz_steam_id', steamid);

    // Always trigger add-player on a fresh login — this registers them in
    // the leaderboard (or refreshes their stats if already registered).
    // Rate-limited so re-logging in quickly won't spam Actions.
    triggerAddPlayer(steamid);
    updateLastSeen(steamid);

    // Fetch avatar + nickname from world cache, then fall back to Steam proxy
    fetch(`https://raw.githubusercontent.com/rxdstrx/kzlb/main/cache/world-kz-players.json`)
      .then(r => r.json())
      .then(d => {
        const player = (d.players || []).find(p => p.steamid === steamid);
        if (player?.avatar)    localStorage.setItem('kz_steam_avatar', player.avatar);
        if (player?.nickname)  localStorage.setItem('kz_steam_nick', player.nickname);
        updateNavAuth();
        // Supplement with Steam proxy if world cache doesn't have them yet
        if (!player) fetchSteamProfile(steamid).then(updateNavAuth);
      })
      .catch(() => fetchSteamProfile(steamid).then(updateNavAuth));
  }

  history.replaceState(null, '', window.location.pathname + window.location.search);
})();

// ── Update navbar based on auth state ──
function updateNavAuth() {
  const auth = getAuth();

  const navSteamLogin     = document.getElementById('navSteamLogin');
  const navUser           = document.getElementById('navUser');
  const navUserAvatar     = document.getElementById('navUserAvatar');
  const navDropdown       = document.getElementById('navDropdown');
  const navDropdownAvatar = document.getElementById('navDropdownAvatar');
  const navDropdownName   = document.getElementById('navDropdownName');
  const navDropdownProfile= document.getElementById('navDropdownProfile');
  const navLogoutBtn      = document.getElementById('navLogoutBtn');

  if (auth) {
    if (navSteamLogin) navSteamLogin.classList.add('hidden');
    if (navUser)       navUser.classList.remove('hidden');

    const avatar = auth.avatar || '';
    const nick   = auth.nickname || 'My Profile';

    if (navUserAvatar     && avatar) navUserAvatar.src     = avatar;
    if (navDropdownAvatar && avatar) navDropdownAvatar.src = avatar;
    if (navDropdownName)             navDropdownName.textContent = nick;
    if (navDropdownProfile)          navDropdownProfile.href = `profile.html?steamid=${auth.steamid}`;

    if (navUserAvatar && navDropdown && !navUserAvatar._dropdownBound) {
      navUserAvatar._dropdownBound = true;
      navUserAvatar.addEventListener('click', (e) => {
        e.stopPropagation();
        navDropdown.classList.toggle('hidden');
      });
      document.addEventListener('click', () => navDropdown.classList.add('hidden'));
    }

    if (navLogoutBtn) {
      navLogoutBtn.addEventListener('click', () => {
        clearAuth();
        location.reload();
      });
    }
  } else {
    if (navSteamLogin) navSteamLogin.classList.remove('hidden');
    if (navUser)       navUser.classList.add('hidden');
  }

  // Refresh pinned self row if leaderboard is visible
  if (typeof renderPinnedSelf === 'function') renderPinnedSelf();
  if (typeof renderPinnedSelfCountry === 'function') renderPinnedSelfCountry();
}

// No modal — login is handled by login.html
function maybeShowLoginModal() {}

// ── On every page load: sync avatar + ensure player is registered ──
function syncPlayerData() {
  const auth = getAuth();
  if (!auth) return;

  // Read from Supabase (instant, no CDN delay)
  fetch(`https://btcufotfvfnuoiokghjm.supabase.co/rest/v1/players?steamid=eq.${auth.steamid}&select=steamid,nickname,avatar,country&limit=1`, {
    headers: { apikey: SB_ANON_AUTH, Authorization: `Bearer ${SB_ANON_AUTH}` }
  })
  .then(r => r.json())
  .then(rows => {
    const player = rows && rows.length > 0 ? rows[0] : null;
    if (player?.avatar)   localStorage.setItem('kz_steam_avatar', player.avatar);
    if (player?.nickname) localStorage.setItem('kz_steam_nick', player.nickname);
    if (player?.country && player.country !== 'xx') localStorage.setItem('kz_country', player.country);
    updateNavAuth();

    if (!player) {
      triggerAddPlayer(auth.steamid);
      if (!auth.avatar) fetchSteamProfile(auth.steamid).then(updateNavAuth);
    }
  })
  .catch(() => {
    if (!auth.avatar) fetchSteamProfile(auth.steamid).then(updateNavAuth);
  });
}

// Run on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  updateNavAuth();
  syncPlayerData();
  maybeShowLoginModal();
  // Heartbeat: update last_seen on load + every 60s while on site
  const _auth = getAuth();
  if (_auth) {
    updateLastSeen(_auth.steamid);
    setInterval(() => updateLastSeen(_auth.steamid), 60000);
    // Also update when tab becomes visible again
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) updateLastSeen(_auth.steamid);
    });
  }
});

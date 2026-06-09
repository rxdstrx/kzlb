// auth.js — Steam login state management, runs on every page
// ─────────────────────────────────────────────────────────────

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
  return { token, steamid, nickname, avatar };
}

function clearAuth() {
  const steamid = localStorage.getItem('kz_steam_id');
  if (steamid) localStorage.removeItem(`kz_registered_${steamid}`);
  localStorage.removeItem('kz_steam_token');
  localStorage.removeItem('kz_steam_id');
  localStorage.removeItem('kz_steam_nick');
  localStorage.removeItem('kz_steam_avatar');
}

// Register new player — rate-limited to once per 10 min per account
function triggerAddPlayer(steamid) {
  const key  = `kz_registered_${steamid}`;
  const last = parseInt(localStorage.getItem(key) || '0', 10);
  const now  = Date.now();
  if (now - last < 10 * 60 * 1000) return; // already triggered in last 10 min
  localStorage.setItem(key, String(now));

  // Fast path: write directly to GitHub JSON via Vercel (takes ~5 sec, no Action queue)
  fetch(`https://kzlb.vercel.app/api/register-player?steamid=${steamid}`).catch(() => {});

  // Background: full Cybershoke scrape via Action (picks up actual stats if they have any)
  fetch(`https://kzlb.vercel.app/api/trigger-scrape?steamid=${steamid}`).catch(() => {});
}

// Fetch avatar/nickname from Steam Vercel proxy
function fetchSteamProfile(steamid) {
  return fetch(`https://kzlb.vercel.app/api/steam-user?steamid=${steamid}`)
    .then(r => r.json())
    .then(d => {
      if (d.nickname) localStorage.setItem('kz_steam_nick', d.nickname);
      if (d.avatar)   localStorage.setItem('kz_steam_avatar', d.avatar);
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
    localStorage.setItem('kz_steam_token', token);
    localStorage.setItem('kz_steam_id', steamid);

    // Always trigger add-player on a fresh login — this registers them in
    // the leaderboard (or refreshes their stats if already registered).
    // Rate-limited so re-logging in quickly won't spam Actions.
    triggerAddPlayer(steamid);

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

    if (navUserAvatar && navDropdown) {
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
}

// No modal — login is handled by login.html
function maybeShowLoginModal() {}

// ── On every page load: sync avatar + ensure player is registered ──
function syncPlayerData() {
  const auth = getAuth();
  if (!auth) return;

  fetch(`https://raw.githubusercontent.com/rxdstrx/kzlb/main/cache/world-kz-players.json`)
    .then(r => r.json())
    .then(d => {
      const player = (d.players || []).find(p => p.steamid === auth.steamid);

      // Update avatar/nickname if world cache has them
      if (player?.avatar)   localStorage.setItem('kz_steam_avatar', player.avatar);
      if (player?.nickname) localStorage.setItem('kz_steam_nick',   player.nickname);
      updateNavAuth();

      if (!player) {
        // Still not in world leaderboard — trigger add-player (rate-limited)
        triggerAddPlayer(auth.steamid);
        // If we don't have an avatar yet, fetch from Steam proxy
        if (!auth.avatar) fetchSteamProfile(auth.steamid).then(updateNavAuth);
      }
    })
    .catch(() => {
      // World cache unreachable — ensure we have at least an avatar
      if (!auth.avatar) fetchSteamProfile(auth.steamid).then(updateNavAuth);
    });
}

// Run on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  updateNavAuth();
  syncPlayerData();
  maybeShowLoginModal();
});

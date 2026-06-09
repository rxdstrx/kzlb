// auth.js — Steam login state management, runs on every page
// ─────────────────────────────────────────────────────────────

function parseJWTPayload(token) {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  } catch { return null; }
}

function getAuth() {
  const token = localStorage.getItem('kz_steam_token');
  const steamid = localStorage.getItem('kz_steam_id');
  const nickname = localStorage.getItem('kz_steam_nick');
  const avatar = localStorage.getItem('kz_steam_avatar');
  if (!token || !steamid) return null;
  const payload = parseJWTPayload(token);
  if (!payload || payload.exp < Math.floor(Date.now() / 1000)) {
    clearAuth();
    return null;
  }
  return { token, steamid, nickname, avatar };
}

function clearAuth() {
  localStorage.removeItem('kz_steam_token');
  localStorage.removeItem('kz_steam_id');
  localStorage.removeItem('kz_steam_nick');
  localStorage.removeItem('kz_steam_avatar');
}

// Handle token arriving in URL hash after Steam login (#token=JWT:STEAMID)
(function handleHashToken() {
  const hash = window.location.hash;
  if (!hash.startsWith('#token=')) return;
  const raw = hash.slice(7);
  const colonIdx = raw.lastIndexOf(':');
  if (colonIdx === -1) return;
  const token = raw.slice(0, colonIdx);
  const steamid = raw.slice(colonIdx + 1);
  const payload = parseJWTPayload(token);
  if (payload && payload.steamid === steamid) {
    localStorage.setItem('kz_steam_token', token);
    localStorage.setItem('kz_steam_id', steamid);
    // Fetch nickname + avatar from Steam API via our Vercel proxy
    fetch(`https://kzlb.vercel.app/api/steam-user?steamid=${steamid}`)
      .then(r => r.json())
      .then(d => {
        if (d.nickname) localStorage.setItem('kz_steam_nick', d.nickname);
        if (d.avatar) localStorage.setItem('kz_steam_avatar', d.avatar);
        // Refresh navbar
        updateNavAuth();
      }).catch(() => {});
  }
  history.replaceState(null, '', window.location.pathname + window.location.search);
})();

// Update navbar based on auth state
function updateNavAuth() {
  const auth = getAuth();

  const navSteamLogin = document.getElementById('navSteamLogin');
  const navUser = document.getElementById('navUser');
  const navUserAvatar = document.getElementById('navUserAvatar');
  const navDropdown = document.getElementById('navDropdown');
  const navDropdownAvatar = document.getElementById('navDropdownAvatar');
  const navDropdownName = document.getElementById('navDropdownName');
  const navDropdownProfile = document.getElementById('navDropdownProfile');
  const navLogoutBtn = document.getElementById('navLogoutBtn');

  if (auth) {
    if (navSteamLogin) navSteamLogin.classList.add('hidden');
    if (navUser) navUser.classList.remove('hidden');

    const avatar = auth.avatar || '';
    const nick = auth.nickname || 'My Profile';

    if (navUserAvatar && avatar) navUserAvatar.src = avatar;
    if (navDropdownAvatar && avatar) navDropdownAvatar.src = avatar;
    if (navDropdownName) navDropdownName.textContent = nick;
    if (navDropdownProfile) navDropdownProfile.href = `profile.html?steamid=${auth.steamid}`;

    // Toggle dropdown on avatar click
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
    if (navUser) navUser.classList.add('hidden');
  }

  // Refresh pinned self row if leaderboard is visible
  if (typeof renderPinnedSelf === 'function') renderPinnedSelf();
}

// No modal — login is handled by login.html
function maybeShowLoginModal() {}

// Run on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  updateNavAuth();
  maybeShowLoginModal();
});

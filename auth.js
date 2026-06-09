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
    // Fetch nickname + avatar from playerdb
    fetch(`https://playerdb.co/api/player/steam/${steamid}`)
      .then(r => r.json())
      .then(d => {
        const p = d?.data?.player;
        if (p) {
          localStorage.setItem('kz_steam_nick', p.username || '');
          localStorage.setItem('kz_steam_avatar', p.avatar || '');
        }
      }).catch(() => {});
  }
  history.replaceState(null, '', window.location.pathname + window.location.search);
})();

// Update navbar based on auth state
function updateNavAuth() {
  const auth = getAuth();

  const navSteamLogin = document.getElementById('navSteamLogin');
  const navUser = document.getElementById('navUser');
  const navProfileItem = document.getElementById('navProfileItem');
  const navProfileLink = document.getElementById('navProfileLink');
  const navProfileAvatar = document.getElementById('navProfileAvatar');
  const navProfileName = document.getElementById('navProfileName');
  const navUserAvatar = document.getElementById('navUserAvatar');
  const navUserName = document.getElementById('navUserName');
  const navLogoutBtn = document.getElementById('navLogoutBtn');

  if (auth) {
    // Logged in
    if (navSteamLogin) navSteamLogin.classList.add('hidden');
    if (navUser) navUser.classList.remove('hidden');
    if (navProfileItem) navProfileItem.classList.remove('hidden');

    const avatar = auth.avatar || '';
    const nick = auth.nickname || 'My Profile';

    if (navProfileLink) navProfileLink.href = `profile.html?steamid=${auth.steamid}`;
    if (navProfileAvatar && avatar) navProfileAvatar.src = avatar;
    if (navProfileName) navProfileName.textContent = nick;
    if (navUserAvatar && avatar) navUserAvatar.src = avatar;
    if (navUserName) navUserName.textContent = nick;

    if (navLogoutBtn) {
      navLogoutBtn.addEventListener('click', () => {
        clearAuth();
        location.reload();
      });
    }
  } else {
    // Not logged in
    if (navSteamLogin) navSteamLogin.classList.remove('hidden');
    if (navUser) navUser.classList.add('hidden');
    if (navProfileItem) navProfileItem.classList.add('hidden');
  }
}

// Show login modal on first visit (index page only)
function maybeShowLoginModal() {
  if (!document.getElementById('steamModalOverlay')) return;
  const auth = getAuth();
  const skipped = sessionStorage.getItem('kz_login_skipped');
  if (auth || skipped) return;

  const overlay = document.getElementById('steamModalOverlay');
  const skipBtn = document.getElementById('steamModalSkip');
  if (!overlay) return;

  overlay.classList.remove('hidden');

  if (skipBtn) {
    skipBtn.addEventListener('click', () => {
      sessionStorage.setItem('kz_login_skipped', '1');
      overlay.classList.add('hidden');
    });
  }
}

// Run on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  updateNavAuth();
  maybeShowLoginModal();
});

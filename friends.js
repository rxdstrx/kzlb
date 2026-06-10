// friends.js — KZplus friend system

const FRIENDS_API  = 'https://kzlb.vercel.app/api';
const SB_URL       = 'https://btcufotfvfnuoiokghjm.supabase.co';
const SB_ANON      = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0Y3Vmb3RmdmZudW9pb2tnaGptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwODEzMTcsImV4cCI6MjA5NjY1NzMxN30.hj_whZDtPhqfC-5ktGvLfqoMBp_x3G8w3lv5IcBdCX4';

const SB_HEADERS = { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}` };

let _pendingRequests = [];
let _realtimeChannel = null;
let _friendsInitDone = false;

// ── Entry point ──
function initFriends() {
  if (_friendsInitDone) return;
  _friendsInitDone = true;

  const auth = typeof getAuth === 'function' ? getAuth() : null;

  // Bell + notifications only for logged-in users
  if (auth) {
    injectBell();
    loadNotifications(auth.steamid);
    subscribeRealtime(auth);
  }

  // Friends tab is public — visible to everyone (no login needed)
  const profileSteamid = getProfileSteamid();
  if (profileSteamid) {
    if (auth && profileSteamid !== auth.steamid) {
      initAddFriendBtn(auth, profileSteamid);
    }
    initFriendsTab(profileSteamid, auth);
  }
}

// ── Get steamid from URL (for profile page) ──
function getProfileSteamid() {
  const p = new URLSearchParams(window.location.search);
  return p.get('steamid') || null;
}

// ══════════════════════════════════════════
//  NOTIFICATION BELL
// ══════════════════════════════════════════

function injectBell() {
  if (document.getElementById('kz-notif-bell')) return;
  const navUser = document.getElementById('navUser');
  if (!navUser) return;

  const wrap = document.createElement('div');
  wrap.id = 'kz-notif-bell';
  wrap.className = 'kz-notif-bell';
  wrap.innerHTML = `
    <button class="kz-notif-btn" id="kzNotifBtn" aria-label="Notifications">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
        <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
      </svg>
      <span class="kz-notif-badge hidden" id="kzNotifBadge">0</span>
    </button>
    <div class="kz-notif-dropdown hidden" id="kzNotifDropdown">
      <div class="kz-notif-header">Notifications</div>
      <div class="kz-notif-list" id="kzNotifList">
        <div class="kz-notif-empty">No notifications</div>
      </div>
    </div>
  `;
  // Insert inside navUser (avatar wrap) so bell + avatar stay grouped at nav right
  navUser.insertBefore(wrap, navUser.firstChild);

  document.getElementById('kzNotifBtn').addEventListener('click', e => {
    e.stopPropagation();
    document.getElementById('kzNotifDropdown').classList.toggle('hidden');
  });
  document.addEventListener('click', () => {
    const dd = document.getElementById('kzNotifDropdown');
    if (dd) dd.classList.add('hidden');
  });
  document.getElementById('kzNotifDropdown').addEventListener('click', e => e.stopPropagation());
}

function updateBadge() {
  const badge = document.getElementById('kzNotifBadge');
  if (!badge) return;
  const count = _pendingRequests.length;
  badge.textContent = count;
  badge.classList.toggle('hidden', count === 0);
}

function renderNotifList() {
  const list = document.getElementById('kzNotifList');
  if (!list) return;
  updateBadge();

  if (!_pendingRequests.length) {
    list.innerHTML = '<div class="kz-notif-empty">No notifications</div>';
    return;
  }

  list.innerHTML = _pendingRequests.map(req => `
    <div class="kz-notif-item" id="kz-notif-${req.id}">
      <img class="kz-notif-avatar" src="${req.from_avatar || ''}" onerror="this.style.display='none'" />
      <div class="kz-notif-info">
        <a class="kz-notif-name" href="profile.html?steamid=${req.from_steamid}">${escHtml(req.from_nickname || req.from_steamid)}</a>
        <span class="kz-notif-text">wants to be your friend</span>
      </div>
      <div class="kz-notif-actions">
        <button class="kz-notif-accept" onclick="friendRespond('${req.id}','accept',this)">✓</button>
        <button class="kz-notif-decline" onclick="friendRespond('${req.id}','decline',this)">✕</button>
      </div>
    </div>
  `).join('');
}

// ══════════════════════════════════════════
//  REAL-TIME + POLLING FALLBACK
// ══════════════════════════════════════════

let _pollInterval = null;

function subscribeRealtime(auth) {
  if (!window.sbClient) {
    startPolling(auth);
    return;
  }

  _realtimeChannel = sbClient.channel(`friends_${auth.steamid}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'friend_requests',
    }, payload => {
      if (payload.new.to_steamid !== auth.steamid) return;
      if (_pendingRequests.find(r => r.id === payload.new.id)) return;
      _pendingRequests.unshift(payload.new);
      renderNotifList();
      flashBell();
    })
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'friend_requests',
    }, payload => {
      if (payload.new.from_steamid !== auth.steamid) return;
      if (payload.new.status === 'accepted') {
        showToast(`${escHtml(payload.new.to_nickname || payload.new.to_steamid)} accepted your friend request!`);
        const profileSteamid = getProfileSteamid();
        if (profileSteamid === payload.new.to_steamid) {
          const btn = document.getElementById('kzAddFriendBtn');
          if (btn) setFriendBtnState(btn, 'friends');
        }
        refreshFriendsTabIfOpen(auth.steamid);
      }
    })
    .subscribe((status, err) => {
      if (err) console.warn('[friends] realtime error:', err);
    });

  // Always run polling alongside real-time as a reliable fallback
  startPolling(auth);
}

function startPolling(auth) {
  if (_pollInterval) return;
  _pollInterval = setInterval(() => pollNotifications(auth.steamid), 5000);
}

async function pollNotifications(steamid) {
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/friend_requests?to_steamid=eq.${steamid}&status=eq.pending&order=created_at.desc`,
      { headers: SB_HEADERS }
    );
    const json = await res.json();
    if (!Array.isArray(json)) return;

    // Find any new requests not already in the list
    const newOnes = json.filter(r => !_pendingRequests.find(p => p.id === r.id));
    if (newOnes.length > 0) {
      _pendingRequests = json; // full refresh
      renderNotifList();
      flashBell();
    }
  } catch {}
}

// ══════════════════════════════════════════
//  LOAD NOTIFICATIONS
// ══════════════════════════════════════════

async function loadNotifications(steamid) {
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/friend_requests?to_steamid=eq.${steamid}&status=eq.pending&order=created_at.desc`,
      { headers: SB_HEADERS }
    );
    const json = await res.json();
    _pendingRequests = Array.isArray(json) ? json : [];
    if (!Array.isArray(json)) console.warn('[friends] loadNotifications unexpected response:', json);
  } catch (e) {
    console.warn('[friends] loadNotifications error:', e);
    _pendingRequests = [];
  }
  renderNotifList();
}

// ══════════════════════════════════════════
//  RESPOND TO REQUEST (accept / decline)
// ══════════════════════════════════════════

async function friendRespond(requestId, action, btn) {
  const auth = typeof getAuth === 'function' ? getAuth() : null;
  if (!auth) return;

  const item = document.getElementById(`kz-notif-${requestId}`);
  if (item) item.querySelectorAll('button').forEach(b => b.disabled = true);

  try {
    const res = await fetch(`${FRIENDS_API}/friend-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: auth.token, action: 'respond', request_id: requestId, respond: action }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);

    // Remove from pending list
    _pendingRequests = _pendingRequests.filter(r => r.id !== requestId);
    renderNotifList();

    if (action === 'accept') {
      showToast('Friend request accepted!');
      refreshFriendsTabIfOpen(auth.steamid);
      // Update add-friend button if on their profile
      const req = _pendingRequests.find(r => r.id === requestId);
      if (req) {
        const profileSteamid = getProfileSteamid();
        if (profileSteamid === req.from_steamid) {
          const btn2 = document.getElementById('kzAddFriendBtn');
          if (btn2) setFriendBtnState(btn2, 'friends');
        }
      }
    }
  } catch (e) {
    if (item) item.querySelectorAll('button').forEach(b => b.disabled = false);
    showToast('Something went wrong. Try again.', true);
  }
}

// ══════════════════════════════════════════
//  ADD FRIEND BUTTON (profile page)
// ══════════════════════════════════════════

async function initAddFriendBtn(auth, profileSteamid) {
  const actionsLeft = document.querySelector('.profile-actions-left');
  if (!actionsLeft) return;

  const btn = document.createElement('button');
  btn.id = 'kzAddFriendBtn';
  btn.className = 'action-btn kz-friend-btn';
  btn.textContent = '…';
  btn.disabled = true;
  actionsLeft.appendChild(btn);

  const status = await getFriendStatus(auth.steamid, profileSteamid);
  setFriendBtnState(btn, status);

  btn.addEventListener('click', async () => {
    const currentAction = btn.dataset.action;
    if (currentAction === 'send') {
      await sendFriendRequest(auth, profileSteamid, btn);
    } else if (currentAction === 'accept-incoming') {
      await acceptIncomingFromProfile(auth, profileSteamid, btn);
    }
  });
}

function setFriendBtnState(btn, status) {
  btn.disabled = false;
  btn.className = 'action-btn kz-friend-btn';
  if (status === 'friends') {
    btn.textContent = '✓ Friends';
    btn.disabled = true;
    btn.classList.add('kz-friend-btn--friends');
    btn.dataset.action = '';
  } else if (status === 'sent') {
    btn.textContent = 'Request Sent';
    btn.disabled = true;
    btn.classList.add('kz-friend-btn--pending');
    btn.dataset.action = '';
  } else if (status === 'incoming') {
    btn.textContent = 'Accept Request';
    btn.classList.add('kz-friend-btn--incoming');
    btn.dataset.action = 'accept-incoming';
  } else {
    btn.textContent = 'Add Friend';
    btn.dataset.action = 'send';
  }
}

async function sendFriendRequest(auth, profileSteamid, btn) {
  btn.disabled = true;
  btn.textContent = 'Sending…';
  try {
    const res = await fetch(`${FRIENDS_API}/friend-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: auth.token, action: 'send', to_steamid: profileSteamid }),
    });
    const data = await res.json();
    if (data.ok) {
      setFriendBtnState(btn, 'sent');
    } else {
      btn.disabled = false;
      btn.textContent = 'Add Friend';
      showToast(data.error || 'Failed to send request', true);
    }
  } catch {
    btn.disabled = false;
    btn.textContent = 'Add Friend';
    showToast('Something went wrong', true);
  }
}

async function acceptIncomingFromProfile(auth, profileSteamid, btn) {
  btn.disabled = true;
  btn.textContent = 'Accepting…';
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/friend_requests?from_steamid=eq.${profileSteamid}&to_steamid=eq.${auth.steamid}&status=eq.pending&select=id`,
      { headers: SB_HEADERS }
    );
    const rows = await res.json();
    if (!rows.length) { setFriendBtnState(btn, 'none'); return; }
    await friendRespond(rows[0].id, 'accept', btn);
    setFriendBtnState(btn, 'friends');
  } catch {
    btn.disabled = false;
    btn.textContent = 'Accept Request';
    showToast('Something went wrong', true);
  }
}

async function getFriendStatus(myId, theirId) {
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/friend_requests?or=(and(from_steamid.eq.${myId},to_steamid.eq.${theirId}),and(from_steamid.eq.${theirId},to_steamid.eq.${myId}))&select=id,status,from_steamid`,
      { headers: SB_HEADERS }
    );
    const rows = await res.json();
    if (!rows.length) return 'none';
    const row = rows[0];
    if (row.status === 'accepted') return 'friends';
    if (row.status === 'pending' && row.from_steamid === myId) return 'sent';
    if (row.status === 'pending' && row.from_steamid === theirId) return 'incoming';
  } catch {}
  return 'none';
}

// ══════════════════════════════════════════
//  FRIENDS TAB (profile page)
// ══════════════════════════════════════════

async function initFriendsTab(profileSteamid, auth) {
  const tab = document.querySelector('[data-tab="friends"]');
  if (!tab) return;
  tab.addEventListener('click', () => {
    renderFriendsList(profileSteamid, auth);
  });
  // If tab is already active on load
  if (!document.getElementById('tab-friends')?.classList.contains('hidden')) {
    renderFriendsList(profileSteamid, auth);
  }
}

async function renderFriendsList(profileSteamid, auth) {
  const container = document.getElementById('tab-friends');
  if (!container) return;

  container.innerHTML = '<div class="kz-friends-loading">Loading…</div>';

  try {
    // Fetch friend rows
    const res = await fetch(
      `${SB_URL}/rest/v1/friend_requests?or=(from_steamid.eq.${profileSteamid},to_steamid.eq.${profileSteamid})&status=eq.accepted&order=updated_at.desc`,
      { headers: SB_HEADERS }
    );
    const rows = await res.json();

    if (!Array.isArray(rows) || !rows.length) {
      container.innerHTML = `
        <div class="friends-empty-wrap">
          <div class="friends-empty-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </div>
          <p class="friends-empty-title">No friends yet</p>
          <p class="friends-empty-sub">Add friends from their profile pages.</p>
        </div>`;
      return;
    }

    const isOwnProfile = auth && auth.steamid === profileSteamid;

    // Collect all friend steamids to batch-fetch banners + world rank
    const friendIds = rows.map(row => {
      const isFrom = row.from_steamid === profileSteamid;
      return isFrom ? row.to_steamid : row.from_steamid;
    });

    // Fetch banners from Supabase
    const bannerMap = {};
    try {
      const idList = friendIds.map(id => `steamid.eq.${id}`).join(',');
      const bRes = await fetch(
        `${SB_URL}/rest/v1/player_profiles?or=(${idList})&select=steamid,banner_url`,
        { headers: SB_HEADERS }
      );
      const bRows = await bRes.json();
      if (Array.isArray(bRows)) bRows.forEach(r => { if (r.banner_url) bannerMap[r.steamid] = r.banner_url; });
    } catch {}

    // Fetch world ranks from world cache
    const rankMap = {};
    try {
      const wRes = await fetch('https://raw.githubusercontent.com/rxdstrx/kzlb/main/cache/world-kz-players.json');
      const world = await wRes.json();
      (world.players || []).forEach((p, i) => { rankMap[p.steamid] = i + 1; });
    } catch {}

    const html = rows.map(row => {
      const isFrom = row.from_steamid === profileSteamid;
      const friendSteamid  = isFrom ? row.to_steamid  : row.from_steamid;
      const friendNickname = isFrom ? (row.to_nickname || friendSteamid) : (row.from_nickname || friendSteamid);
      const friendAvatar   = isFrom ? row.to_avatar    : row.from_avatar;
      const banner = bannerMap[friendSteamid] || '';
      const rank   = rankMap[friendSteamid] ? `#${Number(rankMap[friendSteamid]).toLocaleString()}` : '';
      const removeBtn = isOwnProfile
        ? `<button class="kz-friend-remove" onclick="removeFriend('${row.id}', this)" title="Remove friend">✕</button>`
        : '';
      return `
        <div class="kz-friend-card" id="kz-friend-row-${row.id}" style="${banner ? `--friend-banner:url(${banner})` : ''}">
          <div class="kz-friend-card-bg ${banner ? 'has-banner' : ''}"></div>
          <img class="kz-friend-card-avatar" src="${friendAvatar || ''}" onerror="this.style.display='none'" />
          <div class="kz-friend-card-info">
            ${rank ? `<span class="kz-friend-card-rank">${rank}</span>` : ''}
            <a class="kz-friend-card-name" href="profile.html?steamid=${friendSteamid}">${escHtml(friendNickname)}</a>
          </div>
          ${removeBtn}
        </div>`;
    }).join('');

    container.innerHTML = `<div class="kz-friends-grid">${html}</div>`;
  } catch {
    container.innerHTML = '<div class="kz-notif-empty">Failed to load friends.</div>';
  }
}

async function removeFriend(requestId, btn) {
  const auth = typeof getAuth === 'function' ? getAuth() : null;
  if (!auth || !confirm('Remove this friend?')) return;
  btn.disabled = true;
  try {
    const res = await fetch(`${FRIENDS_API}/friend-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: auth.token, action: 'respond', request_id: requestId, respond: 'decline' }),
    });
    const data = await res.json();
    if (data.ok) {
      const row = document.getElementById(`kz-friend-row-${requestId}`);
      if (row) row.remove();
      // Show empty state if no more friends
      const list = document.querySelector('.kz-friends-list');
      if (list && !list.children.length) renderFriendsList(auth.steamid, auth);
    }
  } catch { btn.disabled = false; }
}

// ══════════════════════════════════════════
//  UTILITIES
// ══════════════════════════════════════════

function refreshFriendsTabIfOpen(steamid) {
  const tab = document.getElementById('tab-friends');
  if (tab && !tab.classList.contains('hidden')) {
    const auth = typeof getAuth === 'function' ? getAuth() : null;
    renderFriendsList(steamid, auth);
  }
}

function flashBell() {
  const btn = document.getElementById('kzNotifBtn');
  if (!btn) return;
  btn.classList.add('kz-bell-flash');
  setTimeout(() => btn.classList.remove('kz-bell-flash'), 600);
}

let _toastTimer = null;
function showToast(msg, isError = false) {
  let toast = document.getElementById('kz-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'kz-toast';
    toast.className = 'kz-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.className = 'kz-toast' + (isError ? ' kz-toast--error' : '') + ' kz-toast--show';
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => toast.classList.remove('kz-toast--show'), 3000);
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Bootstrap — runs for everyone, auth optional ──
(function bootstrap() {
  const tryInit = () => {
    // Always init (friends tab is public); wait briefly for auth to settle
    let attempts = 0;
    const iv = setInterval(() => {
      const ready = typeof getAuth === 'function';
      if (ready || ++attempts > 20) {
        clearInterval(iv);
        initFriends();
      }
    }, 100);
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryInit);
  } else {
    tryInit();
  }
})();

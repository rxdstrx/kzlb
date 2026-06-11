// friends.js — KZplus friend system

const FRIENDS_API  = 'https://kzlb.vercel.app/api';
const SB_URL       = 'https://btcufotfvfnuoiokghjm.supabase.co';
const SB_ANON      = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0Y3Vmb3RmdmZudW9pb2tnaGptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwODEzMTcsImV4cCI6MjA5NjY1NzMxN30.hj_whZDtPhqfC-5ktGvLfqoMBp_x3G8w3lv5IcBdCX4';

const SB_HEADERS = { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}` };

let _pendingRequests = [];
let _acceptedNotifs  = [];   // friend_accepted notifications from DB
let _realtimeChannel = null;
let _friendsInitDone = false;

// ── Entry point ──
function initFriends() {
  if (_friendsInitDone) return;
  _friendsInitDone = true;

  const auth = typeof getAuth === 'function' ? getAuth() : null;

  // Bell + notifications only for logged-in users
  if (auth) {
    injectBell(auth);
    loadNotifications(auth.steamid);
    loadAcceptedNotifs(auth);
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

function injectBell(auth) {
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
    const dd = document.getElementById('kzNotifDropdown');
    const wasHidden = dd.classList.contains('hidden');
    dd.classList.toggle('hidden');
    // Mark accepted notifs as read when opening
    if (wasHidden && auth) markNotifsRead(auth);
  });
  document.addEventListener('click', () => {
    const dd = document.getElementById('kzNotifDropdown');
    if (dd) dd.classList.add('hidden');
  });
  document.getElementById('kzNotifDropdown').addEventListener('click', e => e.stopPropagation());

  // Load accepted notifications
  if (auth) {
    loadAcceptedNotifs(auth);
    // Real-time: refresh when new notification inserted
    const sbClient = window.sbClient;
    if (sbClient) {
      sbClient.channel(`notif_bell_${auth.steamid}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `steamid=eq.${auth.steamid}`,
        }, () => loadAcceptedNotifs(auth))
        .subscribe();
    }
  }
}

function timeSinceShort(dateStr) {
  const s = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (s < 60)    return `${s}s ago`;
  if (s < 3600)  return `${Math.floor(s/60)}m ago`;
  if (s < 86400) return `${Math.floor(s/3600)}h ago`;
  return `${Math.floor(s/86400)}d ago`;
}

// Live-update all notification timestamps every second (stops at 60s)
let _notifTimerInterval = null;
function startNotifTimer() {
  if (_notifTimerInterval) return;
  _notifTimerInterval = setInterval(() => {
    const timeEls = document.querySelectorAll('.kz-notif-time[data-ts]');
    let anyLive = false;
    timeEls.forEach(el => {
      const s = Math.floor((Date.now() - new Date(el.dataset.ts)) / 1000);
      if (s < 60) { el.textContent = `${s}s ago`; anyLive = true; }
      else { el.textContent = timeSinceShort(el.dataset.ts); }
    });
    if (!anyLive) { clearInterval(_notifTimerInterval); _notifTimerInterval = null; }
  }, 1000);
}

function updateBadge() {
  const badge = document.getElementById('kzNotifBadge');
  if (!badge) return;
  const unreadAccepted = _acceptedNotifs.filter(n => !n.read).length;
  const count = _pendingRequests.length + unreadAccepted;
  badge.textContent = count;
  badge.classList.toggle('hidden', count === 0);
}

function renderNotifList() {
  const list = document.getElementById('kzNotifList');
  if (!list) return;
  updateBadge();

  const pendingHtml = _pendingRequests.map(req => `
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

  const acceptedHtml = _acceptedNotifs.map(n => {
    const msg = n.type === 'friend_you_accepted'
      ? `You accepted <a class="kz-notif-name" href="profile.html?steamid=${n.from_steamid}">${escHtml(n.from_nickname || n.from_steamid)}</a>'s friend request`
      : `<a class="kz-notif-name" href="profile.html?steamid=${n.from_steamid}">${escHtml(n.from_nickname || n.from_steamid)}</a> accepted your friend request`;
    return `
      <div class="kz-notif-item ${n.read ? '' : 'kz-notif-unread'}">
        <img class="kz-notif-avatar" src="${n.from_avatar || ''}" onerror="this.style.display='none'" />
        <div class="kz-notif-info" style="flex:1">
          <span class="kz-notif-text">${msg}</span>
          <div class="kz-notif-time" data-ts="${n.created_at}">${timeSinceShort(n.created_at)}</div>
        </div>
      </div>`;
  }).join('');

  const combined = pendingHtml + acceptedHtml;
  list.innerHTML = combined || '<div class="kz-notif-empty">No notifications</div>';
  if (_acceptedNotifs.length) startNotifTimer();
}

async function loadAcceptedNotifs(auth) {
  try {
    const res = await fetch(`${FRIENDS_API}/friend-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: auth.token, action: 'get-notifications' }),
    });
    const data = await res.json();
    if (res.ok && data.notifications) {
      _acceptedNotifs = data.notifications;
      renderNotifList();
    }
  } catch {}
}

async function markNotifsRead(auth) {
  try {
    await fetch(`${FRIENDS_API}/friend-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: auth.token, action: 'notifications-read' }),
    });
    _acceptedNotifs = _acceptedNotifs.map(n => ({ ...n, read: true }));
    updateBadge();
  } catch {}
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

  _realtimeChannel = window.sbClient.channel(`friends_${auth.steamid}`)
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
        refreshFriendsTabIfOpen(auth.steamid);
        // Sender gets notified — poll a few times until notification appears
        const before = _acceptedNotifs.length;
        const tryLoad = (delay, attempts) => {
          setTimeout(async () => {
            await loadAcceptedNotifs(auth);
            if (_acceptedNotifs.length > before) { flashBell(); return; }
            if (attempts > 1) tryLoad(2000, attempts - 1);
          }, delay);
        };
        tryLoad(1500, 4);
      }
    })
    // ── Real-time: new notification inserted (client-side filter) ──
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'notifications',
    }, (payload) => {
      if (payload.new?.steamid === auth.steamid) {
        loadAcceptedNotifs(auth);
        flashBell();
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
  _pollInterval = setInterval(async () => {
    await pollNotifications(auth.steamid);
    // Also poll accepted notifications so sender gets live bell without refresh
    const prevCount = _acceptedNotifs.length;
    const prevUnread = _acceptedNotifs.filter(n => !n.read).length;
    await loadAcceptedNotifs(auth);
    const newUnread = _acceptedNotifs.filter(n => !n.read).length;
    if (_acceptedNotifs.length > prevCount || newUnread > prevUnread) {
      flashBell();
    }
  }, 5000);
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

    if (action === 'accept') {
        showToast('Friend request accepted!');
      refreshFriendsTabIfOpen(auth.steamid);
      setTimeout(() => loadAcceptedNotifs(auth), 800);
    } else {
      renderNotifList();
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

  // Wrapper holds both the button and unfriend dropdown
  const wrap = document.createElement('div');
  wrap.id = 'kzFriendBtnWrap';
  wrap.className = 'kz-friend-btn-wrap';

  const btn = document.createElement('button');
  btn.id = 'kzAddFriendBtn';
  btn.className = 'action-btn kz-friend-btn';
  btn.textContent = '…';
  btn.disabled = true;
  wrap.appendChild(btn);
  actionsLeft.appendChild(wrap);

  const status = await getFriendStatus(auth.steamid, profileSteamid);
  setFriendBtnState(wrap, btn, status, auth, profileSteamid);

  // Real-time: instantly update when friendship deleted or updated
  const sbClient = window.sbClient;
  if (sbClient) {
    sbClient.channel(`friend_btn_${auth.steamid}_${profileSteamid}`)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'friend_requests' }, (payload) => {
        const old = payload.old || {};
        const involves =
          (old.from_steamid === auth.steamid && old.to_steamid === profileSteamid) ||
          (old.from_steamid === profileSteamid && old.to_steamid === auth.steamid);
        if (involves) setFriendBtnState(wrap, btn, 'none', auth, profileSteamid);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'friend_requests' }, async () => {
        const newStatus = await getFriendStatus(auth.steamid, profileSteamid);
        setFriendBtnState(wrap, btn, newStatus, auth, profileSteamid);
      })
      .subscribe();
  }

  btn.addEventListener('click', async () => {
    const currentAction = btn.dataset.action;
    if (currentAction === 'send') {
      await sendFriendRequest(auth, profileSteamid, btn);
    } else if (currentAction === 'accept-incoming') {
      await acceptIncomingFromProfile(auth, profileSteamid, btn);
    }
  });
}

function setFriendBtnState(wrap, btn, status, auth, profileSteamid) {
  if (!wrap || !btn) return;
  // Remove any existing unfriend dropdown
  const existing = wrap.querySelector('.kz-unfriend-dropdown');
  if (existing) existing.remove();

  btn.disabled = false;
  btn.className = 'action-btn kz-friend-btn';

  if (status === 'friends') {
    btn.innerHTML = '✓ Friends <span class="kz-friend-chevron">▾</span>';
    btn.classList.add('kz-friend-btn--friends');
    btn.dataset.action = '';
    btn.disabled = false; // keep enabled so dropdown works

    // Build unfriend dropdown
    const drop = document.createElement('div');
    drop.className = 'kz-unfriend-dropdown';
    drop.innerHTML = `<button class="kz-unfriend-btn">✕ Unfriend</button>`;
    wrap.appendChild(drop);

    drop.querySelector('.kz-unfriend-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('Remove this friend?')) return;
      // Find request id
      try {
        const res = await fetch(
          `${SB_URL}/rest/v1/friend_requests?or=(and(from_steamid.eq.${auth.steamid},to_steamid.eq.${profileSteamid}),and(from_steamid.eq.${profileSteamid},to_steamid.eq.${auth.steamid}))&select=id&limit=1`,
          { headers: SB_HEADERS }
        );
        const rows = await res.json();
        if (!rows.length) return;
        const removeRes = await fetch(`${FRIENDS_API}/friend-action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: auth.token, action: 'respond', request_id: rows[0].id, respond: 'decline' }),
        });
        const data = await removeRes.json();
        if (data.ok) setFriendBtnState(wrap, btn, 'none', auth, profileSteamid);
      } catch {}
    });

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

function getWrap() { return document.getElementById('kzFriendBtnWrap'); }

async function sendFriendRequest(auth, profileSteamid, btn) {
  btn.disabled = true;
  btn.textContent = 'Sending…';
  let ok = false, errorMsg = '';
  try {
    const res = await fetch(`${FRIENDS_API}/friend-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: auth.token, action: 'send', to_steamid: profileSteamid }),
    });
    const data = await res.json();
    ok = !!data.ok;
    errorMsg = data.error || 'Failed to send request';
  } catch {
    errorMsg = 'Network error';
  }
  if (ok) {
    setFriendBtnState(getWrap(), btn, 'sent', auth, profileSteamid);
  } else {
    btn.disabled = false;
    btn.textContent = 'Add Friend';
    showToast(errorMsg, true);
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
    if (!rows.length) { setFriendBtnState(getWrap(), btn, 'none', auth, profileSteamid); return; }
    await friendRespond(rows[0].id, 'accept', btn);
    setFriendBtnState(getWrap(), btn, 'friends', auth, profileSteamid);
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

    // Fetch nickname, avatar, last_seen from players table (authoritative — overrides stale request data)
    const playerDataMap = {};
    const lastSeenMap = {};
    const ONLINE_MS = 3 * 60 * 1000;
    try {
      const idFilter = friendIds.map(id => `steamid.eq.${id}`).join(',');
      const lsRes = await fetch(
        `${SB_URL}/rest/v1/players?or=(${idFilter})&select=steamid,nickname,avatar,last_seen`,
        { headers: SB_HEADERS }
      );
      const lsRows = await lsRes.json();
      if (Array.isArray(lsRows)) lsRows.forEach(r => {
        lastSeenMap[r.steamid] = r.last_seen;
        playerDataMap[r.steamid] = { nickname: r.nickname, avatar: r.avatar };
      });
    } catch {}

    const DEFAULT_BANNER = 'https://cdn.akamai.steamstatic.com/steam/apps/730/library_hero.jpg';

    const html = rows.map(row => {
      const isFrom = row.from_steamid === profileSteamid;
      const friendSteamid  = isFrom ? row.to_steamid  : row.from_steamid;
      const pd = playerDataMap[friendSteamid];
      // Use live players table data first; fall back to stored request data, then steamid
      const friendNickname = (pd?.nickname) || (isFrom ? row.to_nickname : row.from_nickname) || friendSteamid;
      const friendAvatar   = (pd?.avatar)   || (isFrom ? row.to_avatar   : row.from_avatar)   || '';
      const banner = bannerMap[friendSteamid] || DEFAULT_BANNER;
      const rank   = rankMap[friendSteamid] ? `#${Number(rankMap[friendSteamid]).toLocaleString()}` : '';
      const removeBtn = isOwnProfile
        ? `<button class="kz-friend-remove" onclick="removeFriend('${row.id}', this)" title="Remove friend">✕</button>`
        : '';
      const ls = lastSeenMap[friendSteamid];
      const isOnline = ls && (Date.now() - new Date(ls).getTime()) < ONLINE_MS;
      const onlineDot = isOnline
        ? `<span style="display:inline-flex;align-items:center;gap:4px;font-size:0.7rem;color:#4ade80;font-weight:600"><span style="width:7px;height:7px;border-radius:50%;background:#4ade80;box-shadow:0 0 6px #4ade80;display:inline-block"></span>Online</span>`
        : '';
      return `
        <div class="kz-friend-card" id="kz-friend-row-${row.id}" style="--friend-banner:url(${banner})">
          <div class="kz-friend-card-bg has-banner"></div>
          <img class="kz-friend-card-avatar" src="${friendAvatar || ''}" onerror="this.style.display='none'" />
          <div class="kz-friend-card-info">
            ${rank ? `<span class="kz-friend-card-rank">${rank}</span>` : ''}
            <a class="kz-friend-card-name" href="profile.html?steamid=${friendSteamid}">${escHtml(friendNickname)}</a>
            ${onlineDot}
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

// chat.js — KZ Chat Widget
(function () {
  const SB_URL  = 'https://btcufotfvfnuoiokghjm.supabase.co';
  const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0Y3Vmb3RmdmZudW9pb2tnaGptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwODEzMTcsImV4cCI6MjA5NjY1NzMxN30.hj_whZDtPhqfC-5ktGvLfqoMBp_x3G8w3lv5IcBdCX4';
  const HDR     = { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}` };
  const MAX_MSG = 60; // messages to keep in view

  const widget   = document.getElementById('kzChatWidget');
  const toggle   = document.getElementById('kzChatToggle');
  const body     = document.getElementById('kzChatBody');
  const chevron  = document.getElementById('kzChatChevron');
  const messages = document.getElementById('kzChatMessages');
  const input    = document.getElementById('kzChatInput');
  const sendBtn  = document.getElementById('kzChatSend');
  const selfAvatar = document.getElementById('kzChatSelfAvatar');
  const loginPrompt = document.getElementById('kzChatLoginPrompt');
  const inputWrap   = document.getElementById('kzChatInputWrap');

  let collapsed = false;
  let auth = null;

  // ── Toggle collapse ──
  toggle.addEventListener('click', () => {
    collapsed = !collapsed;
    body.style.display = collapsed ? 'none' : 'flex';
    chevron.style.transform = collapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
  });

  // ── Auth check ──
  function getLocalAuth() {
    const token   = localStorage.getItem('kz_steam_token');
    const steamid = localStorage.getItem('kz_steam_id');
    const nick    = localStorage.getItem('kz_steam_nick');
    const avatar  = localStorage.getItem('kz_steam_avatar');
    if (!token || !steamid) return null;
    try {
      const p = JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
      if (p.exp < Math.floor(Date.now() / 1000)) return null;
      return { token, steamid, nick, avatar };
    } catch { return null; }
  }

  function initAuth() {
    auth = getLocalAuth();
    if (auth) {
      selfAvatar.src = auth.avatar || '';
      selfAvatar.style.display = auth.avatar ? 'block' : 'none';
      inputWrap.classList.remove('hidden');
      loginPrompt.classList.add('hidden');
    } else {
      inputWrap.style.display = 'none';
      loginPrompt.classList.remove('hidden');
    }
  }

  // ── Escape HTML ──
  function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── Time label ──
  function timeLabel(ts) {
    const d = new Date(ts);
    const h = d.getHours().toString().padStart(2,'0');
    const m = d.getMinutes().toString().padStart(2,'0');
    return `${h}:${m}`;
  }

  // ── Render a single message ──
  let lastSteamid = null;
  function renderMsg(msg, prepend = false) {
    const isSelf  = auth && msg.steamid === auth.steamid;
    const grouped = !prepend && msg.steamid === lastSteamid;
    if (!prepend) lastSteamid = msg.steamid;

    const el = document.createElement('div');
    el.className = `kz-msg ${isSelf ? 'kz-msg-self' : ''} ${grouped ? 'kz-msg-grouped' : ''}`;
    el.dataset.id = msg.id;

    el.innerHTML = `
      ${!grouped ? `<img class="kz-msg-avatar" src="${esc(msg.avatar||'')}" onerror="this.style.display='none'" />` : `<div class="kz-msg-avatar-gap"></div>`}
      <div class="kz-msg-content">
        ${!grouped ? `<div class="kz-msg-name"><a href="profile.html?steamid=${esc(msg.steamid)}" class="kz-msg-namelink">${esc(msg.nickname||msg.steamid)}</a><span class="kz-msg-time">${timeLabel(msg.created_at)}</span></div>` : ''}
        <div class="kz-msg-bubble">${esc(msg.text)}</div>
      </div>`;

    if (prepend) {
      messages.prepend(el);
    } else {
      messages.appendChild(el);
      messages.scrollTop = messages.scrollHeight;
    }

    // Trim old messages
    while (messages.children.length > MAX_MSG) messages.removeChild(messages.firstChild);
  }

  // ── Load recent messages ──
  async function loadMessages() {
    const res  = await fetch(`${SB_URL}/rest/v1/chat_messages?order=created_at.desc&limit=40`, { headers: HDR });
    const rows = await res.json();
    if (!Array.isArray(rows)) return;
    // Render oldest first
    rows.reverse().forEach(m => renderMsg(m));
  }

  // ── Send message ──
  async function sendMessage() {
    if (!auth) return;
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    sendBtn.disabled = true;

    const nick   = localStorage.getItem('kz_steam_nick') || auth.steamid;
    const avatar = localStorage.getItem('kz_steam_avatar') || '';

    try {
      const res = await fetch(`${SB_URL}/rest/v1/chat_messages`, {
        method: 'POST',
        headers: { ...HDR, 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({ steamid: auth.steamid, nickname: nick, avatar, text }),
      });
      const rows = await res.json();
      if (res.ok && rows?.[0]) {
        renderMsg(rows[0]); // show immediately without waiting for Realtime
      } else {
        console.error('Chat send error:', rows);
      }
    } catch(e) {
      console.error('Chat send failed:', e);
    }
    sendBtn.disabled = false;
  }

  sendBtn.addEventListener('click', sendMessage);
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });

  // ── Realtime subscription ──
  function subscribeRealtime() {
    const client = window.sbClient || window.supabase?.createClient
      ? null
      : null;
    const sb = window.sbClient || (typeof sbClient !== 'undefined' ? sbClient : null);
    if (!sb) { setTimeout(subscribeRealtime, 300); return; }
    sb.channel('kz-chat')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, payload => {
        renderMsg(payload.new);
      })
      .subscribe();
  }

  // ── Init ──
  document.addEventListener('DOMContentLoaded', () => {
    initAuth();
    loadMessages();
    subscribeRealtime();
  });
})();

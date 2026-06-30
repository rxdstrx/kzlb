// forum.js — KZplus Forum
(function () {
  const SB_URL  = 'https://btcufotfvfnuoiokghjm.supabase.co';
  const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0Y3Vmb3RmdmZudW9pb2tnaGptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwODEzMTcsImV4cCI6MjA5NjY1NzMxN30.hj_whZDtPhqfC-5ktGvLfqoMBp_x3G8w3lv5IcBdCX4';
  const HDR     = { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}`, 'Content-Type': 'application/json' };
  const PAGE_SIZE = 20;

  // ── Helpers ──
  function esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function timeAgo(ts) {
    const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
    if (diff < 60)   return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
    if (diff < 86400)return `${Math.floor(diff/3600)}h ago`;
    if (diff < 604800)return `${Math.floor(diff/86400)}d ago`;
    return new Date(ts).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
  }

  function catClass(cat) {
    const map = { general:'cat-general', maps:'cat-maps', records:'cat-records', help:'cat-help', 'off-topic':'cat-off-topic' };
    return map[cat] || 'cat-general';
  }
  function catLabel(cat) {
    const map = { general:'General', maps:'Maps', records:'Records', help:'Help', 'off-topic':'Off Topic' };
    return map[cat] || cat;
  }

  function getAuth() {
    const token   = localStorage.getItem('kz_steam_token');
    const steamid = localStorage.getItem('kz_steam_id');
    if (!token || !steamid) return null;
    try {
      const p = JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
      if (p.exp < Math.floor(Date.now()/1000)) return null;
      return { token, steamid, nickname: localStorage.getItem('kz_steam_nick')||steamid, avatar: localStorage.getItem('kz_steam_avatar')||'' };
    } catch { return null; }
  }

  // ════════════════════════════════════
  //  FORUM LIST PAGE (forum.html)
  // ════════════════════════════════════
  if (document.getElementById('forumThreads')) {
    const listEl    = document.getElementById('forumThreads');
    const newPostBtn= document.getElementById('newPostBtn');
    const modal     = document.getElementById('newPostModal');
    const closeModal= document.getElementById('closeModal');
    const cancelPost= document.getElementById('cancelPost');
    const submitPost= document.getElementById('submitPost');
    const postTitle = document.getElementById('postTitle');
    const postBody  = document.getElementById('postBody');
    const postCat   = document.getElementById('postCategory');
    const postError = document.getElementById('postError');
    const loadMoreBtn = document.getElementById('loadMoreBtn');

    let activeCat    = 'all';
    let offset       = 0;
    let threads      = [];
    let hasMore      = false;
    let threadIds    = new Set();
    let myListLikes  = new Set();

    // ── Upvote delegation (catches clicks before <a> navigates) ──
    listEl.addEventListener('click', e => {
      const btn = e.target.closest('.thread-upvote');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      toggleListUpvote(btn, btn.dataset.threadId);
    });

    // ── Load threads ──
    async function loadThreads(reset = true) {
      if (reset) { offset = 0; threads = []; threadIds = new Set(); myListLikes = new Set(); listEl.innerHTML = '<div class="forum-loading">Loading threads…</div>'; }
      const catFilter = activeCat === 'all' ? '' : `&category=eq.${activeCat}`;
      const res = await fetch(
        `${SB_URL}/rest/v1/forum_threads?order=created_at.desc&limit=${PAGE_SIZE + 1}&offset=${offset}${catFilter}&select=*`,
        { headers: HDR }
      );
      const rows = await res.json();
      if (!Array.isArray(rows)) { listEl.innerHTML = '<div class="forum-empty"><div class="forum-empty-icon">💬</div>Failed to load.</div>'; return; }

      hasMore = rows.length > PAGE_SIZE;
      const page = rows.slice(0, PAGE_SIZE).filter(t => !threadIds.has(t.id));
      page.forEach(t => threadIds.add(t.id));
      threads = reset ? page : [...threads, ...page];
      offset += page.length;

      renderThreads();
      loadMoreBtn.style.display = hasMore ? 'inline-block' : 'none';
      loadMyListLikes();
    }

    async function loadMyListLikes() {
      const auth = getAuth();
      if (!auth || !threads.length) return;
      const ids = threads.map(t => `t_${t.id}`).join(',');
      const res = await fetch(`${SB_URL}/rest/v1/forum_likes?steamid=eq.${auth.steamid}&target_id=in.(${ids})&select=target_id`, { headers: HDR });
      const rows = await res.json();
      if (!Array.isArray(rows)) return;
      rows.forEach(r => myListLikes.add(r.target_id));
      // update upvote button states without full re-render
      threads.forEach(t => {
        const btn = listEl.querySelector(`.thread-upvote[data-thread-id="${t.id}"]`);
        if (btn) btn.classList.toggle('upvoted', myListLikes.has(`t_${t.id}`));
      });
    }

    async function toggleListUpvote(btn, threadId) {
      const auth = getAuth();
      if (!auth) { window.location.href = 'login.html'; return; }
      const targetKey = `t_${threadId}`;
      const wasLiked  = myListLikes.has(targetKey);
      const thread    = threads.find(t => String(t.id) === String(threadId));
      const newCount  = Math.max(0, ((thread?.likes) || 0) + (wasLiked ? -1 : 1));
      // optimistic
      wasLiked ? myListLikes.delete(targetKey) : myListLikes.add(targetKey);
      btn.classList.toggle('upvoted', !wasLiked);
      const countEl = btn.querySelector('.thread-upvote-count');
      if (countEl) countEl.textContent = newCount;
      if (thread) thread.likes = newCount;
      // persist
      if (wasLiked) {
        await fetch(`${SB_URL}/rest/v1/forum_likes?steamid=eq.${auth.steamid}&target_id=eq.${targetKey}`, { method: 'DELETE', headers: HDR });
      } else {
        await fetch(`${SB_URL}/rest/v1/forum_likes`, {
          method: 'POST', headers: { ...HDR, Prefer: 'return=minimal' },
          body: JSON.stringify({ steamid: auth.steamid, target_id: targetKey }),
        });
      }
      await fetch(`${SB_URL}/rest/v1/forum_threads?id=eq.${threadId}`, {
        method: 'PATCH', headers: { ...HDR, Prefer: 'return=minimal' },
        body: JSON.stringify({ likes: newCount }),
      });
    }

    function renderThreads() {
      if (!threads.length) {
        listEl.innerHTML = '<div class="forum-empty"><div class="forum-empty-icon">💬</div>No posts yet. Be the first!</div>';
        return;
      }
      listEl.innerHTML = threads.map(t => `
        <a class="thread-card" href="thread.html?id=${t.id}" style="display:flex;flex-direction:row;align-items:center;gap:10px;text-decoration:none;">
          <img class="thread-avatar" src="${esc(t.avatar)}" onerror="this.style.display='none'" style="width:28px;height:28px;border-radius:7px;object-fit:cover;flex-shrink:0;" />
          <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:3px;">
            <div style="display:flex;align-items:center;gap:7px;min-width:0;">
              <span class="thread-category ${catClass(t.category)}">${catLabel(t.category)}</span>
              <span class="thread-title">${esc(t.title)}</span>
            </div>
            <div class="thread-meta">
              <a class="thread-meta-author" href="profile.html?steamid=${esc(t.steamid)}" onclick="event.stopPropagation()">${esc(t.nickname)}</a>
              <span class="thread-meta-sep">·</span>
              <span>${timeAgo(t.created_at)}</span>
              <span class="thread-meta-sep">·</span>
              <span>💬 ${t.reply_count||0}</span>
            </div>
          </div>
          <span class="thread-upvote ${myListLikes.has('t_'+t.id)?'upvoted':''}" data-thread-id="${t.id}" role="button" style="flex-shrink:0;width:auto;display:inline-flex;align-items:center;gap:4px;padding:5px 10px;cursor:pointer;">
            ↑ <span class="thread-upvote-count">${t.likes||0}</span>
          </span>
        </a>`).join('');
    }

    // ── Category filter ──
    document.querySelectorAll('.forum-cat-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.forum-cat-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeCat = btn.dataset.cat;
        loadThreads();
      });
    });

    // ── Load more ──
    loadMoreBtn.addEventListener('click', () => loadThreads(false));

    // ── Modal open/close ──
    function openModal() {
      const auth = getAuth();
      if (!auth) { window.location.href = 'login.html'; return; }
      modal.classList.add('open');
      postTitle.focus();
    }
    function closeModalFn() { modal.classList.remove('open'); postError.style.display = 'none'; }

    newPostBtn.addEventListener('click', openModal);
    closeModal.addEventListener('click', closeModalFn);
    cancelPost.addEventListener('click', closeModalFn);
    modal.addEventListener('click', e => { if (e.target === modal) closeModalFn(); });

    // ── Submit post ──
    submitPost.addEventListener('click', async () => {
      const auth = getAuth();
      if (!auth) { window.location.href = 'login.html'; return; }

      const title   = postTitle.value.trim();
      const rawBody = postBody.value.trim();
      const ytUrl   = (document.getElementById('postYoutube')?.value || '').trim();
      const body    = ytUrl ? `[YT:${ytUrl}]\n${rawBody}` : rawBody;
      const cat     = postCat.value;

      if (!title)   { postError.textContent = 'Title is required.'; postError.style.display = 'block'; return; }
      if (!rawBody) { postError.textContent = 'Body is required.';  postError.style.display = 'block'; return; }
      if (title.length < 4) { postError.textContent = 'Title too short.'; postError.style.display = 'block'; return; }

      submitPost.disabled = true;
      submitPost.textContent = 'Posting…';
      postError.style.display = 'none';

      const res = await fetch(`${SB_URL}/rest/v1/forum_threads`, {
        method: 'POST',
        headers: { ...HDR, Prefer: 'return=representation' },
        body: JSON.stringify({ steamid: auth.steamid, nickname: auth.nickname, avatar: auth.avatar, title, body, category: cat, likes: 0, reply_count: 0 }),
      });
      const rows = await res.json();

      submitPost.disabled = false;
      submitPost.textContent = 'Post';

      if (res.ok && rows?.[0]) {
        closeModalFn();
        postTitle.value = '';
        postBody.value  = '';
        if (!threadIds.has(rows[0].id)) {
          threadIds.add(rows[0].id);
          threads.unshift(rows[0]);
          renderThreads();
        }
      } else {
        postError.textContent = rows?.message || 'Failed to post. Try again.';
        postError.style.display = 'block';
      }
    });

    // ── Realtime ──
    function subscribeThreads() {
      const sb = typeof sbClient !== 'undefined' ? sbClient : null;
      if (!sb) { setTimeout(subscribeThreads, 300); return; }
      sb.channel('forum-threads')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'forum_threads' }, payload => {
          if (threadIds.has(payload.new.id)) return;
          const auth = getAuth();
          if (auth && payload.new.steamid === auth.steamid) return;
          threadIds.add(payload.new.id);
          threads.unshift(payload.new);
          renderThreads();
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'forum_threads' }, payload => {
          const idx = threads.findIndex(t => t.id === payload.new.id);
          if (idx !== -1) { threads[idx] = payload.new; renderThreads(); }
        })
        .subscribe();
    }

    // ── Featured threads (sidebar) ──
    async function loadFeatured() {
      const el = document.getElementById('featuredThreads');
      if (!el) return;
      const res = await fetch(`${SB_URL}/rest/v1/forum_threads?order=likes.desc&limit=5&select=id,title,category,likes`, { headers: HDR });
      const rows = await res.json();
      if (!Array.isArray(rows) || !rows.length) { el.innerHTML = '<div style="font-size:0.75rem;color:rgba(255,255,255,0.3);padding:8px 0">No posts yet.</div>'; return; }
      el.innerHTML = rows.map(t => `
        <a class="forum-featured-item" href="thread.html?id=${t.id}">
          <span class="forum-featured-badge ${catClass(t.category)}">${catLabel(t.category)}</span>
          <span class="forum-featured-title">${esc(t.title)}</span>
          <span class="forum-featured-upvotes">↑${t.likes||0}</span>
        </a>`).join('');
    }

    // ── Thread count (sidebar stats) ──
    async function loadThreadCount() {
      const res = await fetch(`${SB_URL}/rest/v1/forum_threads?select=id`, { headers: { ...HDR, Prefer: 'count=exact', Range: '0-0' } });
      const count = res.headers.get('content-range')?.split('/')[1] || '—';
      const statEl = document.getElementById('statPostCount');
      if (statEl) statEl.textContent = count;
      const tcEl = document.getElementById('threadCount');
      if (tcEl) tcEl.textContent = count + ' posts';
    }

    // ── Category legend clicks ──
    function wireCatLegend() {
      document.querySelectorAll('.forum-cat-legend-item').forEach(item => {
        item.addEventListener('click', () => {
          const cat = item.dataset.cat;
          document.querySelectorAll('.forum-cat-btn').forEach(b => b.classList.toggle('active', b.dataset.cat === cat));
          activeCat = cat;
          loadThreads();
        });
      });
    }

    loadThreads();
    subscribeThreads();
    loadFeatured();
    loadThreadCount();
    wireCatLegend();
  }

  // ── Notification helper ──
  async function sendForumNotification(toSteamid, auth, type, threadId, threadTitle) {
    try {
      await fetch(`${SB_URL}/rest/v1/forum_notifications`, {
        method: 'POST',
        headers: { ...HDR, Prefer: 'return=minimal' },
        body: JSON.stringify({ steamid: toSteamid, from_steamid: auth.steamid, from_nick: auth.nickname, from_avatar: auth.avatar || '', type, thread_id: threadId, thread_title: threadTitle || '' }),
      });
    } catch (_) {}
  }

  // ════════════════════════════════════
  //  THREAD PAGE (thread.html)
  // ════════════════════════════════════
  if (document.getElementById('threadPost')) {
    const threadId   = new URLSearchParams(window.location.search).get('id');
    const threadEl   = document.getElementById('threadPost');
    const repliesEl  = document.getElementById('repliesList');
    const composerEl = document.getElementById('replyComposer');
    const headerEl   = document.getElementById('repliesHeader');

    let thread   = null;
    let replies  = [];
    let myLikes  = new Set();

    if (!threadId) { threadEl.innerHTML = '<div class="forum-empty">Thread not found.</div>'; return; }

    async function loadThread() {
      const res  = await fetch(`${SB_URL}/rest/v1/forum_threads?id=eq.${threadId}&select=*&limit=1`, { headers: HDR });
      const rows = await res.json();
      if (!rows?.[0]) { threadEl.innerHTML = '<div class="forum-empty">Thread not found.</div>'; return; }
      thread = rows[0];
      document.title = `${thread.title} — KZplus Forum`;
      renderThread();
      loadReplies();
      loadMyLikes();
      renderComposer();
      subscribeReplies();
      loadPlaylist();
    }

    function extractYtId(text) {
      const m = text.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/);
      return m ? m[1] : null;
    }
    function stripYtTag(text) {
      return text.replace(/^\[YT:[^\]]+\]\n?/, '').replace(/https?:\/\/(?:www\.)?(?:youtu\.be\/|youtube\.com\/\S+)/g, '').trim();
    }

    async function loadPlaylist() {
      const res  = await fetch(`${SB_URL}/rest/v1/forum_threads?steamid=eq.${encodeURIComponent(thread.steamid)}&order=created_at.desc&select=id,title,created_at,category`, { headers: HDR });
      const rows = await res.json();
      if (!Array.isArray(rows)) return;
      const countEl = document.getElementById('playlistCount');
      const listEl  = document.getElementById('playlistItems');
      if (countEl) countEl.textContent = `· ${rows.length}`;
      if (!listEl) return;
      listEl.innerHTML = rows.map(p => {
        const isCurrent = String(p.id) === String(threadId);
        return `<a href="thread.html?id=${p.id}" class="playlist-item ${isCurrent ? 'playlist-item--active' : ''}">
          <div class="playlist-item-meta">
            <span class="thread-category ${catClass(p.category)}" style="font-size:0.55rem">${catLabel(p.category)}</span>
            <span class="playlist-item-date">${timeAgo(p.created_at)}</span>
          </div>
          <div class="playlist-item-title">${esc(p.title)}</div>
        </a>`;
      }).join('');
    }

    async function loadReplies() {
      const res  = await fetch(`${SB_URL}/rest/v1/forum_replies?thread_id=eq.${threadId}&order=created_at.asc&select=*`, { headers: HDR });
      const rows = await res.json();
      replies = Array.isArray(rows) ? rows : [];
      renderReplies();
    }

    async function loadMyLikes() {
      const auth = getAuth();
      if (!auth) return;
      const res  = await fetch(`${SB_URL}/rest/v1/forum_likes?steamid=eq.${auth.steamid}&select=target_id`, { headers: HDR });
      const rows = await res.json();
      if (Array.isArray(rows)) rows.forEach(r => myLikes.add(r.target_id));
      renderThread();
      renderReplies();
    }

    function renderThread() {
      if (!thread) return;
      const liked = myLikes.has(`t_${thread.id}`);

      // Populate info bar
      const avatarEl  = document.getElementById('infobarAvatar');
      const nameEl    = document.getElementById('infobarName');
      const subjectEl = document.getElementById('infobarSubject');
      const catEl     = document.getElementById('infobarCat');
      if (avatarEl)  { avatarEl.src = thread.avatar; avatarEl.onerror = () => avatarEl.style.display = 'none'; }
      if (nameEl)    { nameEl.textContent = thread.nickname; nameEl.href = `profile.html?steamid=${thread.steamid}`; }
      if (subjectEl) subjectEl.textContent = thread.title;
      if (catEl)     { catEl.textContent = catLabel(thread.category); catEl.className = `thread-category ${catClass(thread.category)}`; }

      // YouTube embed
      const ytId    = extractYtId(thread.body);
      const mediaEl = document.getElementById('threadMedia');
      if (ytId && mediaEl) {
        mediaEl.classList.remove('hidden');
        mediaEl.innerHTML = `<div class="thread-yt-wrap"><iframe src="https://www.youtube.com/embed/${ytId}" frameborder="0" allow="autoplay;encrypted-media" allowfullscreen></iframe></div>`;
      }

      // Post card
      const displayBody = stripYtTag(thread.body);
      threadEl.innerHTML = `
        <div class="thread-post-date-line">${timeAgo(thread.created_at)}</div>
        <h2 class="thread-post-title-v2">${esc(thread.title)}</h2>
        <div class="thread-post-body-v2">${esc(displayBody).replace(/\n/g,'<br>')}</div>
        <div class="thread-post-actions-v2">
          <button class="post-action-btn like-btn ${liked?'liked':''}" id="likeThreadBtn" data-id="t_${thread.id}" data-table="forum_threads" data-row="${thread.id}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="${liked?'currentColor':'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            <span id="threadLikeCount">${thread.likes||0}</span>
          </button>
          <button class="post-action-btn" id="upThreadBtn">↑</button>
          <span class="post-action-meta">💬 ${thread.reply_count||0} replies</span>
        </div>`;
      document.getElementById('likeThreadBtn')?.addEventListener('click', () => toggleLike(`t_${thread.id}`, 'forum_threads', thread.id, 'threadLikeCount'));
      document.getElementById('upThreadBtn')?.addEventListener('click', function() { this.classList.toggle('upvoted'); });
    }

    function renderReplies() {
      const countEl = document.getElementById('repliesCount');
      if (headerEl) headerEl.style.display = replies.length ? 'flex' : 'none';
      if (countEl) countEl.textContent = replies.length;
      if (!replies.length) { repliesEl.innerHTML = ''; return; }

      repliesEl.innerHTML = replies.map((r, i) => {
        const liked = myLikes.has(`r_${r.id}`);
        return `
          <div class="reply-acc" id="reply-${r.id}">
            <button class="reply-acc-toggle" data-idx="${i}" aria-expanded="false">
              <div class="reply-acc-toggle-left">
                <img class="reply-acc-avatar" src="${esc(r.avatar)}" onerror="this.style.display='none'" />
                <a class="reply-acc-name" href="profile.html?steamid=${esc(r.steamid)}" onclick="event.stopPropagation()">${esc(r.nickname)}</a>
                <span class="reply-acc-preview">${esc(r.body).slice(0,60)}${r.body.length>60?'…':''}</span>
              </div>
              <div class="reply-acc-toggle-right">
                ${r.likes ? `<span class="reply-acc-likes">♥ ${r.likes}</span>` : ''}
                <span class="reply-acc-date">${timeAgo(r.created_at)}</span>
                <svg class="reply-acc-arrow" width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 4l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </div>
            </button>
            <div class="reply-acc-body" aria-hidden="true">
              <div class="reply-acc-body-inner">
                <div class="reply-body">${esc(r.body).replace(/\n/g,'<br>')}</div>
                <div class="reply-footer">
                  <button class="post-action-btn like-btn ${liked?'liked':''}" data-id="r_${r.id}" data-table="forum_replies" data-row="${r.id}">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="${liked?'currentColor':'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                    <span>${r.likes||0}</span>
                  </button>
                  <button class="post-action-btn reply-upvote-btn">↑</button>
                </div>
              </div>
            </div>
          </div>`;
      }).join('');

      repliesEl.querySelectorAll('.reply-acc-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
          const expanded = btn.getAttribute('aria-expanded') === 'true';
          btn.setAttribute('aria-expanded', !expanded);
          const body = btn.nextElementSibling;
          body.setAttribute('aria-hidden', expanded);
          if (!expanded) {
            body.style.maxHeight = body.scrollHeight + 'px';
          } else {
            body.style.maxHeight = '0';
          }
          btn.querySelector('.reply-acc-arrow')?.classList.toggle('open', !expanded);
        });
      });

      repliesEl.querySelectorAll('.like-btn').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const span = btn.querySelector('span');
          toggleLike(btn.dataset.id, btn.dataset.table, btn.dataset.row, null, span);
        });
      });
      repliesEl.querySelectorAll('.reply-upvote-btn').forEach(btn => {
        btn.addEventListener('click', e => { e.stopPropagation(); btn.classList.toggle('upvoted'); });
      });
    }

    function appendReply(reply) {
      replies.push(reply);
      if (headerEl) { headerEl.style.display = 'flex'; }
      const countEl = document.getElementById('repliesCount');
      if (countEl) countEl.textContent = replies.length;
      const div = document.createElement('div');
      div.className = 'reply-acc';
      div.id = `reply-${reply.id}`;
      div.innerHTML = `
        <button class="reply-acc-toggle" aria-expanded="false">
          <div class="reply-acc-toggle-left">
            <img class="reply-acc-avatar" src="${esc(reply.avatar)}" onerror="this.style.display='none'" />
            <a class="reply-acc-name" href="profile.html?steamid=${esc(reply.steamid)}" onclick="event.stopPropagation()">${esc(reply.nickname)}</a>
            <span class="reply-acc-preview">${esc(reply.body).slice(0,60)}${reply.body.length>60?'…':''}</span>
          </div>
          <div class="reply-acc-toggle-right">
            <span class="reply-acc-date">${timeAgo(reply.created_at)}</span>
            <svg class="reply-acc-arrow" width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 4l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </div>
        </button>
        <div class="reply-acc-body" aria-hidden="true">
          <div class="reply-acc-body-inner">
            <div class="reply-body">${esc(reply.body).replace(/\n/g,'<br>')}</div>
            <div class="reply-footer">
              <button class="post-action-btn like-btn" data-id="r_${reply.id}" data-table="forum_replies" data-row="${reply.id}">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                <span>${reply.likes||0}</span>
              </button>
              <button class="post-action-btn reply-upvote-btn">↑</button>
            </div>
          </div>
        </div>`;
      div.querySelector('.reply-acc-toggle').addEventListener('click', function() {
        const expanded = this.getAttribute('aria-expanded') === 'true';
        this.setAttribute('aria-expanded', !expanded);
        const body = this.nextElementSibling;
        body.setAttribute('aria-hidden', expanded);
        body.style.maxHeight = !expanded ? body.scrollHeight + 'px' : '0';
        this.querySelector('.reply-acc-arrow')?.classList.toggle('open', !expanded);
      });
      div.querySelector('.like-btn')?.addEventListener('click', function(e) {
        e.stopPropagation();
        const span = this.querySelector('span');
        toggleLike(this.dataset.id, this.dataset.table, this.dataset.row, null, span);
      });
      div.querySelector('.reply-upvote-btn')?.addEventListener('click', function(e) {
        e.stopPropagation(); this.classList.toggle('upvoted');
      });
      repliesEl.appendChild(div);
      div.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    async function toggleLike(targetKey, table, rowId, countElId, spanEl) {
      const auth = getAuth();
      if (!auth) { window.location.href = 'login.html'; return; }

      const liked = myLikes.has(targetKey);
      const delta = liked ? -1 : 1;

      if (liked) {
        myLikes.delete(targetKey);
        await fetch(`${SB_URL}/rest/v1/forum_likes?steamid=eq.${auth.steamid}&target_id=eq.${targetKey}`, { method: 'DELETE', headers: HDR });
      } else {
        myLikes.add(targetKey);
        await fetch(`${SB_URL}/rest/v1/forum_likes`, {
          method: 'POST',
          headers: { ...HDR, Prefer: 'return=minimal' },
          body: JSON.stringify({ steamid: auth.steamid, target_id: targetKey }),
        });
      }

      const getRes    = await fetch(`${SB_URL}/rest/v1/${table}?id=eq.${rowId}&select=likes`, { headers: HDR });
      const [current] = await getRes.json();
      const newCount  = Math.max(0, (current?.likes || 0) + delta);
      await fetch(`${SB_URL}/rest/v1/${table}?id=eq.${rowId}`, {
        method: 'PATCH',
        headers: { ...HDR, Prefer: 'return=minimal' },
        body: JSON.stringify({ likes: newCount }),
      });

      const countEl = countElId ? document.getElementById(countElId) : spanEl;
      if (countEl) countEl.textContent = newCount;
      const btn = countElId ? document.getElementById('likeThreadBtn') : spanEl?.closest('.like-btn');
      if (btn) btn.classList.toggle('liked', !liked);

      if (table === 'forum_threads' && thread) thread.likes = newCount;

      // Send notification to post/reply author (not when un-liking, not own content)
      const auth2 = getAuth();
      if (!liked && auth2) {
        if (table === 'forum_threads' && thread && thread.steamid !== auth2.steamid) {
          sendForumNotification(thread.steamid, auth2, 'like', thread.id, thread.title);
        } else if (table === 'forum_replies') {
          const reply = replies.find(r => String(r.id) === String(rowId));
          if (reply && reply.steamid !== auth2.steamid) {
            sendForumNotification(reply.steamid, auth2, 'like_reply', thread?.id, thread?.title);
          }
        }
      }
    }

    function renderComposer() {
      const auth = getAuth();
      if (!auth) {
        composerEl.innerHTML = `<div class="reply-login-prompt">
          <a href="login.html">Login with Steam</a> to reply
        </div>`;
        return;
      }
      composerEl.innerHTML = `
        <div class="reply-composer">
          <div class="reply-composer-header">
            <img class="reply-composer-avatar" src="${esc(auth.avatar)}" onerror="this.style.display='none'" />
            <span class="reply-composer-name">${esc(auth.nickname)}</span>
          </div>
          <textarea class="reply-textarea" id="replyTextarea" placeholder="Write a reply…" maxlength="1000"></textarea>
          <div class="reply-composer-footer">
            <span class="reply-char-count" id="replyCharCount">0 / 1000</span>
            <button class="btn-reply" id="submitReply">Reply</button>
          </div>
        </div>`;

      const textarea = document.getElementById('replyTextarea');
      const charCount= document.getElementById('replyCharCount');
      const submitBtn= document.getElementById('submitReply');

      textarea.addEventListener('input', () => {
        charCount.textContent = `${textarea.value.length} / 1000`;
      });

      submitBtn.addEventListener('click', async () => {
        const body = textarea.value.trim();
        if (!body) return;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Posting…';

        const res  = await fetch(`${SB_URL}/rest/v1/forum_replies`, {
          method: 'POST',
          headers: { ...HDR, Prefer: 'return=representation' },
          body: JSON.stringify({ thread_id: Number(threadId), steamid: auth.steamid, nickname: auth.nickname, avatar: auth.avatar, body, likes: 0 }),
        });
        const rows = await res.json();

        submitBtn.disabled   = false;
        submitBtn.textContent= 'Reply';

        if (res.ok && rows?.[0]) {
          textarea.value = '';
          charCount.textContent = '0 / 1000';
          appendReply(rows[0]);
          const newCount = (thread?.reply_count || 0) + 1;
          await fetch(`${SB_URL}/rest/v1/forum_threads?id=eq.${threadId}`, {
            method: 'PATCH',
            headers: { ...HDR, Prefer: 'return=minimal' },
            body: JSON.stringify({ reply_count: newCount }),
          });
          if (thread) thread.reply_count = newCount;
          // Notify thread author of new reply
          if (thread && thread.steamid !== auth.steamid) {
            sendForumNotification(thread.steamid, auth, 'reply', thread.id, thread.title);
          }
        }
      });
    }

    function subscribeReplies() {
      const sb = typeof sbClient !== 'undefined' ? sbClient : null;
      if (!sb) { setTimeout(subscribeReplies, 300); return; }
      sb.channel(`thread-${threadId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'forum_replies',
          filter: `thread_id=eq.${threadId}` }, payload => {
          const auth = getAuth();
          if (auth && payload.new.steamid === auth.steamid) return;
          if (replies.find(r => r.id === payload.new.id)) return;
          appendReply(payload.new);
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'forum_threads',
          filter: `id=eq.${threadId}` }, payload => {
          if (thread) {
            thread.likes = payload.new.likes;
            thread.reply_count = payload.new.reply_count;
          }
        })
        .subscribe();
    }

    loadThread();
  }
})();

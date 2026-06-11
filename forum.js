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

    let activeCat   = 'all';
    let activeSort  = 'new'; // 'new' or 'top'
    let offset      = 0;
    let threads     = [];
    let hasMore     = false;
    let threadIds   = new Set(); // dedup guard
    let myUpvotes   = new Set(); // thread ids I upvoted

    // ── Load my upvotes ──
    async function loadMyUpvotes() {
      const auth = getAuth();
      if (!auth) return;
      const res = await fetch(`${SB_URL}/rest/v1/forum_upvotes?steamid=eq.${auth.steamid}&select=thread_id`, { headers: HDR });
      const rows = await res.json();
      if (Array.isArray(rows)) rows.forEach(r => myUpvotes.add(r.thread_id));
    }

    // ── Load threads ──
    async function loadThreads(reset = true) {
      if (reset) { offset = 0; threads = []; threadIds = new Set(); listEl.innerHTML = '<div class="forum-loading">Loading threads…</div>'; }
      const catFilter  = activeCat === 'all' ? '' : `&category=eq.${activeCat}`;
      const sortOrder  = activeSort === 'top' ? 'upvotes.desc,created_at.desc' : 'created_at.desc';
      const res = await fetch(
        `${SB_URL}/rest/v1/forum_threads?order=${sortOrder}&limit=${PAGE_SIZE + 1}&offset=${offset}${catFilter}&select=*`,
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
    }

    function renderThreads() {
      if (!threads.length) {
        listEl.innerHTML = '<div class="forum-empty"><div class="forum-empty-icon">💬</div>No posts yet. Be the first!</div>';
        return;
      }
      listEl.innerHTML = threads.map(t => {
        const voted = myUpvotes.has(t.id);
        return `
        <a class="thread-card" href="thread.html?id=${t.id}">
          <img class="thread-avatar" src="${esc(t.avatar)}" onerror="this.src=''" />
          <div class="thread-main">
            <div class="thread-top">
              <span class="thread-category ${catClass(t.category)}">${catLabel(t.category)}</span>
              <span class="thread-title">${esc(t.title)}</span>
            </div>
            <div class="thread-body-preview">${esc(t.body)}</div>
            <div class="thread-meta">
              <a class="thread-meta-author" href="profile.html?steamid=${esc(t.steamid)}" onclick="event.stopPropagation()">${esc(t.nickname)}</a>
              <span class="thread-meta-sep">·</span>
              <span>${timeAgo(t.created_at)}</span>
              <span class="thread-meta-sep">·</span>
              <span>❤ ${t.likes||0}</span>
              <span class="thread-meta-sep">·</span>
              <span>💬 ${t.reply_count||0}</span>
              <span class="thread-meta-sep">·</span>
              <button class="upvote-btn ${voted?'upvoted':''}" data-id="${t.id}" onclick="event.preventDefault();event.stopPropagation();toggleUpvote(Number(this.dataset.id),this)" title="Upvote">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
                <span class="upvote-count">${t.upvotes||0}</span>
              </button>
            </div>
          </div>
        </a>`;
      }).join('');
    }

    // ── Toggle upvote ──
    window.toggleUpvote = async function toggleUpvote(threadId, btn) {
      const auth = getAuth();
      if (!auth) { window.location.href = 'login.html'; return; }
      const voted = myUpvotes.has(threadId);
      const delta = voted ? -1 : 1;
      if (voted) { myUpvotes.delete(threadId); } else { myUpvotes.add(threadId); }
      btn.classList.toggle('upvoted', !voted);

      const t = threads.find(x => x.id === threadId);
      if (t) { t.upvotes = Math.max(0, (t.upvotes||0) + delta); btn.querySelector('.upvote-count').textContent = t.upvotes; }

      if (voted) {
        await fetch(`${SB_URL}/rest/v1/forum_upvotes?steamid=eq.${auth.steamid}&thread_id=eq.${threadId}`, { method: 'DELETE', headers: HDR });
      } else {
        await fetch(`${SB_URL}/rest/v1/forum_upvotes`, { method: 'POST', headers: { ...HDR, Prefer: 'return=minimal' }, body: JSON.stringify({ steamid: auth.steamid, thread_id: threadId }) });
      }
      await fetch(`${SB_URL}/rest/v1/forum_threads?id=eq.${threadId}`, {
        method: 'PATCH', headers: { ...HDR, Prefer: 'return=minimal' },
        body: JSON.stringify({ upvotes: t?.upvotes ?? 0 }),
      });
    }

    // ── Sort toggle ──
    document.querySelectorAll('.forum-sort-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.forum-sort-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeSort = btn.dataset.sort;
        loadThreads();
      });
    });

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

      const title = postTitle.value.trim();
      const body  = postBody.value.trim();
      const cat   = postCat.value;

      if (!title) { postError.textContent = 'Title is required.'; postError.style.display = 'block'; return; }
      if (!body)  { postError.textContent = 'Body is required.';  postError.style.display = 'block'; return; }
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
        // Instantly prepend
        threads.unshift(rows[0]);
        renderThreads();
      } else {
        postError.textContent = rows?.message || 'Failed to post. Try again.';
        postError.style.display = 'block';
      }
    });

    // ── Realtime: new thread from someone else ──
    function subscribeThreads() {
      const sb = typeof sbClient !== 'undefined' ? sbClient : null;
      if (!sb) { setTimeout(subscribeThreads, 300); return; }
      sb.channel('forum-threads')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'forum_threads' }, payload => {
          const auth = getAuth();
          if (auth && payload.new.steamid === auth.steamid) return; // already added locally
          threads.unshift(payload.new);
          renderThreads();
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'forum_threads' }, payload => {
          const idx = threads.findIndex(t => t.id === payload.new.id);
          if (idx !== -1) { threads[idx] = payload.new; renderThreads(); }
        })
        .subscribe();
    }

    loadMyUpvotes().then(() => loadThreads());
    subscribeThreads();
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
    let myLikes  = new Set(); // thread/reply ids I liked

    if (!threadId) { threadEl.innerHTML = '<div class="forum-empty">Thread not found.</div>'; return; }

    // ── Load thread ──
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
    }

    // ── Load replies ──
    async function loadReplies() {
      const res  = await fetch(`${SB_URL}/rest/v1/forum_replies?thread_id=eq.${threadId}&order=created_at.asc&select=*`, { headers: HDR });
      const rows = await res.json();
      replies = Array.isArray(rows) ? rows : [];
      renderReplies();
    }

    // ── Load my likes ──
    async function loadMyLikes() {
      const auth = getAuth();
      if (!auth) return;
      const res  = await fetch(`${SB_URL}/rest/v1/forum_likes?steamid=eq.${auth.steamid}&select=target_id`, { headers: HDR });
      const rows = await res.json();
      if (Array.isArray(rows)) rows.forEach(r => myLikes.add(r.target_id));
      // Re-render to show liked state
      renderThread();
      renderReplies();
    }

    // ── Render thread ──
    function renderThread() {
      if (!thread) return;
      const liked = myLikes.has(`t_${thread.id}`);
      threadEl.innerHTML = `
        <div class="thread-post">
          <div class="thread-post-header">
            <img class="thread-post-avatar" src="${esc(thread.avatar)}" onerror="this.style.display='none'" />
            <div class="thread-post-author">
              <a class="thread-post-name" href="profile.html?steamid=${esc(thread.steamid)}">${esc(thread.nickname)}</a>
              <div class="thread-post-date">${timeAgo(thread.created_at)}</div>
            </div>
            <span class="thread-category ${catClass(thread.category)}">${catLabel(thread.category)}</span>
          </div>
          <div class="thread-post-title">${esc(thread.title)}</div>
          <div class="thread-post-body">${esc(thread.body)}</div>
          <div class="thread-post-footer">
            <button class="like-btn ${liked?'liked':''}" id="likeThreadBtn" data-id="t_${thread.id}" data-table="forum_threads" data-row="${thread.id}">
              ❤ <span id="threadLikeCount">${thread.likes||0}</span>
            </button>
            <span style="font-size:0.72rem;color:rgba(255,255,255,0.25)">💬 ${thread.reply_count||0} replies</span>
          </div>
        </div>`;
      document.getElementById('likeThreadBtn')?.addEventListener('click', () => toggleLike(`t_${thread.id}`, 'forum_threads', thread.id, 'threadLikeCount'));
    }

    // ── Render replies ──
    function renderReplies() {
      headerEl.style.display = replies.length ? 'block' : 'none';
      if (!replies.length) { repliesEl.innerHTML = ''; return; }
      repliesEl.innerHTML = replies.map(r => {
        const liked = myLikes.has(`r_${r.id}`);
        return `
          <div class="reply-card" id="reply-${r.id}">
            <img class="reply-avatar" src="${esc(r.avatar)}" onerror="this.style.display='none'" />
            <div class="reply-content">
              <div class="reply-top">
                <a class="reply-name" href="profile.html?steamid=${esc(r.steamid)}">${esc(r.nickname)}</a>
                <span class="reply-date">${timeAgo(r.created_at)}</span>
              </div>
              <div class="reply-body">${esc(r.body)}</div>
              <div class="reply-footer">
                <button class="like-btn ${liked?'liked':''}" data-id="r_${r.id}" data-table="forum_replies" data-row="${r.id}">
                  ❤ <span>${r.likes||0}</span>
                </button>
              </div>
            </div>
          </div>`;
      }).join('');

      // Bind reply like buttons
      repliesEl.querySelectorAll('.like-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const span = btn.querySelector('span');
          toggleLike(btn.dataset.id, btn.dataset.table, btn.dataset.row, null, span);
        });
      });
    }

    // ── Append single reply (realtime / optimistic) ──
    function appendReply(reply) {
      replies.push(reply);
      headerEl.style.display = 'block';
      const div = document.createElement('div');
      div.className = 'reply-card';
      div.id = `reply-${reply.id}`;
      div.innerHTML = `
        <img class="reply-avatar" src="${esc(reply.avatar)}" onerror="this.style.display='none'" />
        <div class="reply-content">
          <div class="reply-top">
            <a class="reply-name" href="profile.html?steamid=${esc(reply.steamid)}">${esc(reply.nickname)}</a>
            <span class="reply-date">${timeAgo(reply.created_at)}</span>
          </div>
          <div class="reply-body">${esc(reply.body)}</div>
          <div class="reply-footer">
            <button class="like-btn" data-id="r_${reply.id}" data-table="forum_replies" data-row="${reply.id}">
              ❤ <span>${reply.likes||0}</span>
            </button>
          </div>
        </div>`;
      div.querySelector('.like-btn').addEventListener('click', function() {
        const span = this.querySelector('span');
        toggleLike(this.dataset.id, this.dataset.table, this.dataset.row, null, span);
      });
      repliesEl.appendChild(div);
      div.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // ── Toggle like ──
    async function toggleLike(targetKey, table, rowId, countElId, spanEl) {
      const auth = getAuth();
      if (!auth) { window.location.href = 'login.html'; return; }

      const liked   = myLikes.has(targetKey);
      const delta   = liked ? -1 : 1;

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

      // Update likes count in DB
      const getRes   = await fetch(`${SB_URL}/rest/v1/${table}?id=eq.${rowId}&select=likes`, { headers: HDR });
      const [current]= await getRes.json();
      const newCount = Math.max(0, (current?.likes || 0) + delta);
      await fetch(`${SB_URL}/rest/v1/${table}?id=eq.${rowId}`, {
        method: 'PATCH',
        headers: { ...HDR, Prefer: 'return=minimal' },
        body: JSON.stringify({ likes: newCount }),
      });

      // Update UI
      const countEl = countElId ? document.getElementById(countElId) : spanEl;
      if (countEl) countEl.textContent = newCount;
      // Toggle button class
      const btn = countElId ? document.getElementById('likeThreadBtn') : spanEl?.closest('.like-btn');
      if (btn) btn.classList.toggle('liked', !liked);

      if (table === 'forum_threads' && thread) thread.likes = newCount;
    }

    // ── Render reply composer ──
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
          // Increment reply_count
          const newCount = (thread?.reply_count || 0) + 1;
          await fetch(`${SB_URL}/rest/v1/forum_threads?id=eq.${threadId}`, {
            method: 'PATCH',
            headers: { ...HDR, Prefer: 'return=minimal' },
            body: JSON.stringify({ reply_count: newCount }),
          });
          if (thread) thread.reply_count = newCount;
        }
      });
    }

    // ── Realtime: live replies ──
    function subscribeReplies() {
      const sb = typeof sbClient !== 'undefined' ? sbClient : null;
      if (!sb) { setTimeout(subscribeReplies, 300); return; }
      sb.channel(`thread-${threadId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'forum_replies',
          filter: `thread_id=eq.${threadId}` }, payload => {
          const auth = getAuth();
          // Don't double-add own reply (already added optimistically)
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

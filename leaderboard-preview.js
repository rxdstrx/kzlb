// Leaderboard Preview — fetches the same world player data as index.html
(function () {
  const CACHE_BASE = 'https://raw.githubusercontent.com/rxdstrx/kzlb/main/cache';
  const SB_LB_URL  = 'https://btcufotfvfnuoiokghjm.supabase.co';
  const SB_LB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0Y3Vmb3RmdmZudW9pb2tnaGptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwODEzMTcsImV4cCI6MjA5NjY1NzMxN30.hj_whZDtPhqfC-5ktGvLfqoMBp_x3G8w3lv5IcBdCX4';
  const PAGE_SIZE = 15;

  const grid = document.getElementById('lbpGrid');
  const pageLabel = document.getElementById('lbpPageLabel');
  const prevBtn = document.getElementById('lbpPrev');
  const nextBtn = document.getElementById('lbpNext');
  const pageInfoText = document.getElementById('lbpPageText');

  let players = [];
  let page = 1;

  function flagUrl(code) {
    if (!code || code === 'xx') return null;
    return `https://flagcdn.com/24x18/${code.toLowerCase()}.png`;
  }

  function render() {
    const totalPages = Math.max(1, Math.ceil(players.length / PAGE_SIZE));
    page = Math.min(Math.max(1, page), totalPages);

    if (!players.length) {
      grid.innerHTML = '<div class="lbp-empty">No players found.</div>';
      pageLabel.textContent = 'Page 1 of 1';
      prevBtn.disabled = true;
      nextBtn.disabled = true;
      return;
    }

    const start = (page - 1) * PAGE_SIZE;
    const slice = players.slice(start, start + PAGE_SIZE);

    grid.innerHTML = slice.map((p, i) => {
      const rank = start + i + 1;
      const rankClass = rank === 1 ? 'top1' : rank === 2 ? 'top2' : rank === 3 ? 'top3' : '';
      const flag = flagUrl(p.country);
      const globalRank = typeof fmtPlace === 'function' ? fmtPlace(p.kz_place) : (p.kz_place || '—');
      const mapsDone = typeof fmtMaps === 'function' ? fmtMaps(p.kz_maps, p.maps_list) : (p.kz_maps || '0');
      return `
        <a class="lbp-card" href="profile.html?steamid=${p.steamid}&country=${p.country || ''}" style="animation-delay:${i * 0.03}s">
          <span class="lbp-rank ${rankClass}">${rank}</span>
          <div class="lbp-player">
            <img class="lbp-avatar" src="${p.avatar || ''}" onerror="this.style.visibility='hidden'" />
            <div class="lbp-nick">
              ${flag ? `<img class="lbp-flag" src="${flag}" />` : ''}
              <span>${escapeHtml(p.nickname || 'Unknown')}</span>
            </div>
          </div>
          <div class="lbp-pts"><strong>${Number(p.kz_points || 0).toFixed(0)}</strong></div>
          <div class="lbp-grank">${globalRank}</div>
          <div class="lbp-maps">${mapsDone}</div>
        </a>`;
    }).join('');

    pageLabel.textContent = `Page ${page} of ${totalPages}`;
    prevBtn.disabled = page <= 1;
    nextBtn.disabled = page >= totalPages;
    pageInfoText.textContent = `${players.length.toLocaleString()} players tracked`;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  prevBtn.addEventListener('click', () => { page--; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  nextBtn.addEventListener('click', () => { page++; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); });

  async function load() {
    // Free GitHub cache base + only players changed since the cache was built,
    // fetched live from Supabase — same merge index.html's leaderboard uses, so
    // new signups / button-updates show up here instantly instead of waiting
    // for the next scheduled cache rebuild.
    let ghData = null;
    try { ghData = await fetch(`${CACHE_BASE}/world-kz-players.json?bust=${Date.now()}`).then(r => r.ok ? r.json() : null); } catch {}
    const ghPlayers = ghData ? (ghData.players || ghData) : [];

    const cacheTime = ghData && ghData.updated_at ? new Date(ghData.updated_at).getTime() : null;
    const anchor = cacheTime ? new Date(cacheTime - 10 * 60 * 1000).toISOString() : null;
    const sbQuery = anchor
      ? `${SB_LB_URL}/rest/v1/players?updated_at=gt.${encodeURIComponent(anchor)}&order=kz_points.desc&select=steamid,nickname,avatar,country,kz_points,kz_place,kz_maps&limit=20000`
      : `${SB_LB_URL}/rest/v1/players?order=kz_points.desc&select=steamid,nickname,avatar,country,kz_points,kz_place,kz_maps&limit=20000`;
    let sbPlayers = [];
    try {
      sbPlayers = await fetch(sbQuery, { headers: { apikey: SB_LB_ANON, Authorization: `Bearer ${SB_LB_ANON}` } })
        .then(r => r.ok ? r.json() : null) || [];
    } catch {}

    const sbMap = new Map();
    for (const p of sbPlayers) sbMap.set(p.steamid, p);

    const merged = new Map();
    for (const p of ghPlayers) {
      if (sbMap.has(p.steamid)) {
        const sb = sbMap.get(p.steamid);
        merged.set(p.steamid, {
          ...p, ...sb,
          country: (sb.country && sb.country !== 'xx') ? sb.country : (p.country || 'xx'),
        });
      } else {
        merged.set(p.steamid, p);
      }
    }
    for (const p of sbPlayers) {
      if (!merged.has(p.steamid)) merged.set(p.steamid, p);
    }

    players = [...merged.values()].sort((a, b) => (Number(b.kz_points) || 0) - (Number(a.kz_points) || 0));
    render();
  }

  load();
})();

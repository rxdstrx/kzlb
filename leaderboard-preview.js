// Leaderboard Preview — fetches the same world player data as index.html
(function () {
  const CACHE_BASE = 'https://raw.githubusercontent.com/rxdstrx/kzlb/main/cache';
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
    try {
      const res = await fetch(`${CACHE_BASE}/world-kz-players.json?bust=${Date.now()}`);
      const data = res.ok ? await res.json() : null;
      const list = data ? (data.players || data) : [];
      players = list.slice().sort((a, b) => (Number(b.kz_points) || 0) - (Number(a.kz_points) || 0));
    } catch {
      players = [];
    }
    render();
  }

  load();
})();

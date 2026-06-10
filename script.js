// ── Views ──
const viewHome    = document.getElementById('view-home');
const viewProfile = document.getElementById('view-profile');

function showHome() {
  viewHome.style.display    = '';
  viewProfile.style.display = 'none';
  document.title = 'KZ Leaderboard';
}

function showProfile() {
  viewHome.style.display    = 'none';
  viewProfile.style.display = '';
}

// ── Hash router ──
async function route() {
  const hash = window.location.hash; // e.g. #profile/strx666

  if (hash.startsWith('#profile/')) {
    const identifier = decodeURIComponent(hash.slice('#profile/'.length));
    showProfile();
    resetProfile();
    const steamid = await resolveSteamId(identifier);
    if (steamid) {
      loadProfile(steamid);
    } else {
      showError('Could not resolve a Steam ID from that link.');
    }
  } else {
    showHome();
  }
}

window.addEventListener('hashchange', route);
window.addEventListener('load', route);

// ── Back button ──
document.getElementById('backBtn').addEventListener('click', () => {
  window.location.hash = '';
});

// ── Search form ──
document.getElementById('searchForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const raw = document.getElementById('searchInput').value.trim();
  if (!raw) return;

  if (raw.includes('faceit.com')) {
    const faceit = await resolveFaceit(raw);
    if (faceit?.steamid) {
      const country = faceit.country?.toLowerCase();
      const q = country ? `&country=${country}` : '';
      if (country) {
        fetch(`https://kzlb.vercel.app/api/add-player?steamid=${faceit.steamid}&country=${country}`).catch(() => {});
      }
      window.location.href = `profile.html?steamid=${faceit.steamid}${q}`;
    } else {
      showError('Could not find this Faceit profile.');
    }
    return;
  }

  const identifier = extractIdentifier(raw);
  const steamid = await resolveSteamId(identifier);
  if (steamid) {
    window.location.href = `profile.html?steamid=${steamid}`;
  } else {
    showError('Could not resolve a Steam ID from that link.');
  }
});

function extractIdentifier(input) {
  // Direct steamid64
  if (/^\d{17}$/.test(input)) return input;
  // steamcommunity.com/profiles/STEAMID64
  const pm = input.match(/steamcommunity\.com\/profiles\/(\d{17})/);
  if (pm) return pm[1];
  // steamcommunity.com/id/VANITYNAME
  const vm = input.match(/steamcommunity\.com\/id\/([^/?#]+)/);
  if (vm) return vm[1];
  // cybershoke.net/...STEAMID64 (any cybershoke URL with a 17-digit ID)
  const cm = input.match(/cybershoke\.net\/.*?(\d{17})/);
  if (cm) return cm[1];
  // Any URL containing a 17-digit steamid64
  const any = input.match(/\b(\d{17})\b/);
  if (any) return any[1];
  // fallback — treat as vanity name
  return input;
}

async function fetchViaProxy(url) {
  const proxies = [
    `https://corsproxy.io/?${encodeURIComponent(url)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  ];
  for (const proxy of proxies) {
    try {
      const res = await fetch(proxy, { signal: AbortSignal.timeout(6000) });
      if (res.ok) {
        const text = await res.text();
        if (text && text.length > 20) return text;
      }
    } catch {}
  }
  return null;
}

async function resolveSteamId(identifier) {
  // Already a steamid64
  if (/^\d{17}$/.test(identifier)) return identifier;

  const isLocal = location.protocol === 'file:';

  if (!isLocal) {
    try {
      const res  = await fetch(`https://kzlb.vercel.app/api/steam-resolve?input=${encodeURIComponent(identifier)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.steamid) return data.steamid;
      }
    } catch {}
    // Fallback: resolve directly via playerdb
    try {
      const res  = await fetch(`https://playerdb.co/api/player/steam/${encodeURIComponent(identifier)}`);
      const data = await res.json();
      if (data?.data?.player?.id) return data.data.player.id;
    } catch {}
  } else {
    // Fallback for local: playerdb.co supports vanity names
    try {
      const res  = await fetch(`https://playerdb.co/api/player/steam/${encodeURIComponent(identifier)}`);
      const data = await res.json();
      if (data?.data?.player?.id) return data.data.player.id;
    } catch {}
  }

  return null;
}

// ── Profile helpers ──
function resetProfile() {
  document.getElementById('loadingState').classList.remove('hidden');
  document.getElementById('errorState').classList.add('hidden');
  document.getElementById('profileContent').classList.add('hidden');
  document.getElementById('statsBody').innerHTML = '';
  document.getElementById('noStats').classList.add('hidden');
}

function showError(msg) {
  document.getElementById('loadingState').classList.add('hidden');
  document.getElementById('errorState').classList.remove('hidden');
  document.getElementById('errorMsg').textContent = msg;
}

async function loadProfile(sid) {
  try {
    // playerdb.co — free public API with CORS support
    const res  = await fetch(`https://playerdb.co/api/player/steam/${sid}`);
    const data = await res.json();
    const player = data?.data?.player;

    const name   = player?.username || 'Unknown Player';
    const avatar = player?.avatar   || '';

    document.getElementById('playerName').textContent    = name;
    document.getElementById('playerSteamId').textContent = sid;
    document.getElementById('playerAvatar').src          = avatar;
    document.title = `KZ — ${name}`;

    document.getElementById('cybershokeLink').href =
      `https://cybershoke.net/ru/cs2/leaderboard/kz/maps/${sid}`;

    await loadCybershokeStats(sid);

    document.getElementById('loadingState').classList.add('hidden');
    document.getElementById('profileContent').classList.remove('hidden');

  } catch {
    showError('Failed to load Steam profile. Check the link and try again.');
  }
}

async function loadCybershokeStats(sid) {
  const statsBody = document.getElementById('statsBody');
  const noStats   = document.getElementById('noStats');
  const mapLookup = {};
  ALL_MAPS.forEach(m => { mapLookup[m.name] = m; });

  // When hosted on Netlify, use our own serverless function (no CORS issues)
  // When running locally (file://), show fallback link
  const isLocal = location.protocol === 'file:';
  let rows = null;

  if (!isLocal) {
    try {
      const res = await fetch(`/api/kz-stats?steamid=${sid}`, {
        headers: { 'Accept': 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        // Cybershoke returns { data: { items: [...] } } or similar
        rows = Array.isArray(data)
          ? data
          : (data.data?.items || data.data?.maps || data.data || data.items || data.maps || data.results || []);
      }
    } catch (e) {
      console.log('[CS] function error:', e.message);
    }
  }

  if (!rows || !rows.length) {
    noStats.innerHTML = `Stats unavailable — <a href="https://cybershoke.net/ru/cs2/leaderboard/kz/maps/${sid}" target="_blank" rel="noopener" style="color:#818cf8">view on Cybershoke ↗</a>`;
    noStats.classList.remove('hidden');
    return;
  }

  rows.forEach(row => {
    const mapName = row.map || row.mapName || row.map_name || row.name || '—';
    const mapInfo = mapLookup[mapName] || {};
    const tier    = row.tier ?? mapInfo.tier ?? '—';
    const runs    = row.completions ?? row.runs ?? row.count ?? row.finishes ?? '—';
    const time    = row.time ?? row.best_time ?? row.bestTime ?? '—';
    const posNum  = row.position ?? row.rank ?? null;
    const posTotal= row.total ?? row.totalPlayers ?? null;
    const pos     = posNum != null ? `${posNum}${posTotal ? ' / ' + posTotal : ''}` : '—';
    const pts     = row.points != null ? Number(row.points).toFixed(4) : '—';
    const rawDate = row.date ?? row.created_at ?? row.completedAt ?? '';
    const date    = rawDate ? rawDate.slice(0, 10) : '—';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <div class="map-name-cell">
          ${mapInfo.img
            ? `<img class="map-thumb" src="${mapInfo.img}" alt="${mapName}">`
            : '<div class="map-thumb map-thumb-empty"></div>'}
          <span class="mapname-cell">${mapName}</span>
        </div>
      </td>
      <td><span class="tier-badge tier-${tier}">${tier}</span></td>
      <td><span class="runs-cell">${runs}</span></td>
      <td><span class="time-cell">${time}</span></td>
      <td><span class="pos-cell">${pos}</span></td>
      <td><span class="pts-cell">${pts}</span></td>
      <td><span class="date-cell">${date}</span></td>
    `;
    statsBody.appendChild(tr);
  });
}

// ── Chart animation engine ──
(function () {
  const line      = document.querySelector('.chart-line');
  const glowLine  = document.getElementById('chart-glow-line');
  const area      = document.querySelector('.chart-area');
  const endDot    = document.querySelector('.chart-dot');
  const endRing   = document.querySelector('.chart-dot-ring');
  const valueEl   = document.querySelector('.chart-value');
  const changeEl  = document.querySelector('.chart-change');
  if (!line || !valueEl) return;

  // Get actual path length for precise animation
  const LEN = line.getTotalLength();
  line.style.strokeDasharray    = LEN;
  line.style.strokeDashoffset   = LEN;
  if (glowLine) {
    glowLine.style.strokeDasharray  = LEN;
    glowLine.style.strokeDashoffset = LEN;
  }

  // Milestone dots — [x-ratio-along-path, element-index]
  const msDots = Array.from(document.querySelectorAll('.ms-dot'));
  // X positions of each dot: 0, 76, 152, 228, 304, 380 → ratios of total x=380
  const msRatios = [0/380, 76/380, 152/380, 228/380, 304/380, 380/380];
  const msShown  = new Array(msDots.length).fill(false);

  const LINE_DUR = 8000;  // 8s line draw
  const NUM_DUR  = 30000;
  const PCT_DUR  = 8000;
  const START = 3000, END = 3400, END_PCT = 18.4;
  const PCT_MILESTONES = [5, 10, 15, 18.4];
  const pctTriggered = new Set();

  function ease(t) {
    return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2;
  }

  function triggerGlow() {
    if (!glowLine) return;
    glowLine.classList.remove('pulsing');
    void glowLine.offsetWidth;
    glowLine.classList.add('pulsing');
    setTimeout(() => glowLine.classList.remove('pulsing'), 1000);
  }

  function showDot(dot) {
    const center = dot.querySelector('.ms-center');
    const ring   = dot.querySelector('.ms-ring');
    if (center) {
      center.style.animation = 'msDotPop 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards';
    }
    if (ring) {
      ring.style.animation = 'msRingPulse 1.8s ease infinite';
    }
  }

  let startTime = null;

  function tick(ts) {
    if (!startTime) startTime = ts;
    const elapsed = ts - startTime;

    // ── Line drawing ──
    const lineProg = Math.min(elapsed / LINE_DUR, 1);
    const lineEase = ease(lineProg);
    const offset   = LEN * (1 - lineEase);
    line.style.strokeDashoffset = offset;
    if (glowLine) glowLine.style.strokeDashoffset = offset;

    // Fade in area when line is ~70% drawn
    if (lineEase > 0.7 && area) area.style.opacity = ((lineEase - 0.7) / 0.3).toFixed(2);

    // Show end dot when line completes
    if (lineProg >= 1) {
      if (endDot)  endDot.style.opacity  = '1';
      if (endRing) endRing.style.opacity = '0.2';
    }

    // ── Milestone dots — triggered when line passes their x-ratio ──
    msDots.forEach((dot, i) => {
      if (msShown[i]) return;
      if (lineEase >= msRatios[i]) {
        msShown[i] = true;
        showDot(dot);
      }
    });

    // ── Counter ──
    const numProg = Math.min(elapsed / NUM_DUR, 1);
    const pctProg = Math.min(elapsed / PCT_DUR, 1);
    const val = Math.round(START + (END - START) * ease(numProg));
    const pct = END_PCT * ease(pctProg);
    valueEl.textContent  = val.toLocaleString();
    changeEl.textContent = `↑ ${pct.toFixed(1)}%`;

    for (const m of PCT_MILESTONES) {
      if (!pctTriggered.has(m) && pct >= m) {
        pctTriggered.add(m);
        triggerGlow();
      }
    }

    if (numProg < 1 || lineProg < 1) requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
})();

// ── Start button smooth scroll ──
function smoothScrollTo(targetY, duration = 1200) {
  const startY = window.scrollY;
  const diff   = targetY - startY;
  let start    = null;

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function step(timestamp) {
    if (!start) start = timestamp;
    const elapsed  = timestamp - start;
    const progress = Math.min(elapsed / duration, 1);
    window.scrollTo(0, startY + diff * easeInOutCubic(progress));
    if (progress < 1) requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}

document.getElementById('startBtn')?.addEventListener('click', () => {
  const target = document.getElementById('leaderboard-section');
  smoothScrollTo(target.getBoundingClientRect().top + window.scrollY - 20);
});

// ── Leaderboard data ──
const CACHE_BASE = 'https://raw.githubusercontent.com/rxdstrx/kzlb/main/cache';
const COUNTRY_CACHE = { pt: null };
let lbPlayers = [];
let lbSelectedMap = null;
let lbPage = 1;
const LB_PAGE_SIZE = 100;

const lbBody   = document.getElementById('leaderboard-body');
const lbEmpty  = document.getElementById('lbEmpty');
const lbPagTop = document.getElementById('lbPaginationTop');
const lbPagBot = document.getElementById('lbPaginationBottom');

function flagImg(country) {
  if (!country || country === 'xx') return '';
  return `<img class="player-flag-img" src="https://flagcdn.com/w20/${country}.png" alt="${country}" onerror="this.style.display='none'">`;
}

function renderPagination(totalRows) {
  const totalPages = Math.ceil(totalRows / LB_PAGE_SIZE);
  if (totalPages <= 1) { lbPagTop.classList.add('hidden'); lbPagBot.classList.add('hidden'); return; }
  const topHtml = `
    <button class="lb-page-btn" id="lbPrevBtnTop" ${lbPage === 1 ? 'disabled' : ''}>← Prev</button>
    <span class="lb-page-info">Page ${lbPage} of ${totalPages}</span>
    <button class="lb-page-btn" id="lbNextBtnTop" ${lbPage >= totalPages ? 'disabled' : ''}>Next →</button>
  `;
  const botHtml = `
    <button class="lb-page-btn" id="lbPrevBtnBot" ${lbPage === 1 ? 'disabled' : ''}>← Prev</button>
    <span class="lb-page-info">Page ${lbPage} of ${totalPages}</span>
    <button class="lb-page-btn" id="lbNextBtnBot" ${lbPage >= totalPages ? 'disabled' : ''}>Next →</button>
  `;
  lbPagTop.innerHTML = topHtml;
  lbPagBot.innerHTML = botHtml;
  lbPagTop.classList.remove('hidden');
  lbPagBot.classList.remove('hidden');

  const scrollToTop = () => {
    const targetY = document.getElementById('lbPaginationTop').getBoundingClientRect().top + window.scrollY - 80;
    const startY = window.scrollY;
    const diff = targetY - startY;
    const duration = 350;
    let start = null;
    function ease(t) { return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2; }
    function step(ts) {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      window.scrollTo(0, startY + diff * ease(progress));
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  };

  document.getElementById('lbPrevBtnTop').addEventListener('click', () => { lbPage--; renderLeaderboard(); renderPinnedSelf(); });
  document.getElementById('lbNextBtnTop').addEventListener('click', () => { lbPage++; renderLeaderboard(); renderPinnedSelf(); });
  document.getElementById('lbPrevBtnBot').addEventListener('click', () => { lbPage--; renderLeaderboard(); renderPinnedSelf(); scrollToTop(); });
  document.getElementById('lbNextBtnBot').addEventListener('click', () => { lbPage++; renderLeaderboard(); renderPinnedSelf(); scrollToTop(); });
}

function renderLeaderboard() {
  lbBody.innerHTML = '';
  lbEmpty.classList.add('hidden');
  lbPagTop.classList.add('hidden');
  lbPagBot.classList.add('hidden');

  if (!lbPlayers.length) {
    lbEmpty.textContent = selectedCountry
      ? `No KZ data found for ${selectedCountry.name} players.`
      : 'No players found.';
    lbEmpty.classList.remove('hidden');
    return;
  }

  let rows = [...lbPlayers];

  if (lbSelectedMap) {
    // Map view — sort by time
    document.getElementById('lb-col1').textContent = 'Time';
    document.getElementById('lb-col2').textContent = 'Position';
    document.getElementById('lb-col3').textContent = 'Runs';

    rows = rows.map(p => {
      const entry = (p.maps_list || []).find(m => m.map === lbSelectedMap);
      return entry ? { ...p, entry } : null;
    }).filter(Boolean).sort((a, b) => a.entry.time_record.localeCompare(b.entry.time_record));

    if (!rows.length) {
      lbEmpty.textContent = `No players found for ${lbSelectedMap}`;
      lbEmpty.classList.remove('hidden');
      return;
    }

    renderPagination(rows.length);
    const startM = (lbPage - 1) * LB_PAGE_SIZE;
    rows.slice(startM, startM + LB_PAGE_SIZE).forEach((p, i) => {
      const rank = startM + i + 1;
      const rankClass = rank === 1 ? 'top1' : rank === 2 ? 'top2' : rank === 3 ? 'top3' : '';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><span class="rank ${rankClass}">${rank}</span></td>
        <td>
          <div class="player-cell">
            <img class="player-thumb" src="${p.avatar}" onerror="this.style.display='none'" />
            ${flagImg(p.country)}<a class="player-nick" href="profile.html?steamid=${p.steamid}&country=${p.country || ''}">${p.nickname}</a>
          </div>
        </td>
        <td><span class="time-cell">${p.entry.time_record}</span></td>
        <td><span class="pos-cell">${(p.entry.place_num || '').replace(/\u00a0/g, ' ')}</span></td>
        <td><span class="runs-cell">${p.entry.completions}</span></td>
      `;
      lbBody.appendChild(tr);
    });

  } else {
    // Overall view — sort by points
    document.getElementById('lb-col1').textContent = 'Points';
    document.getElementById('lb-col2').textContent = 'Global Rank';
    document.getElementById('lb-col3').textContent = 'Maps Done';

    rows.sort((a, b) => b.kz_points - a.kz_points);

    renderPagination(rows.length);
    const startO = (lbPage - 1) * LB_PAGE_SIZE;
    rows.slice(startO, startO + LB_PAGE_SIZE).forEach((p, i) => {
      const rank = startO + i + 1;
      const rankClass = rank === 1 ? 'top1' : rank === 2 ? 'top2' : rank === 3 ? 'top3' : '';
      const tr = document.createElement('tr');
      tr.dataset.steamid = p.steamid;
      tr.innerHTML = `
        <td><span class="rank ${rankClass}">${rank}</span></td>
        <td>
          <div class="player-cell">
            <img class="player-thumb" src="${p.avatar}" onerror="this.style.display='none'" />
            ${flagImg(p.country)}<a class="player-nick" href="profile.html?steamid=${p.steamid}&country=${p.country || ''}">${p.nickname}</a>
          </div>
        </td>
        <td><span class="pts-cell">${Number(p.kz_points).toFixed(0)}</span></td>
        <td><span class="pos-cell">${fmtPlace(p.kz_place)}</span></td>
        <td><span class="runs-cell">${fmtMaps(p.kz_maps, p.maps_list)}</span></td>
      `;
      lbBody.appendChild(tr);
    });
  }
}

async function loadCountryPlayers(code) {
  const file = code === 'world' ? 'world-kz-players.json' : `${code}-kz-players.json`;
  if (!COUNTRY_CACHE[code]) {
    lbBody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:24px;color:rgba(255,255,255,0.3)">Loading...</td></tr>';
    const res = await fetch(`${CACHE_BASE}/${file}?bust=${Date.now()}`);
    const data = await res.json();
    COUNTRY_CACHE[code] = data.players || [];
  }
  lbPlayers = COUNTRY_CACHE[code];
  lbPage = 1;
  renderLeaderboard();
  renderPinnedSelf();
}

// ── Pinned self row ──
function renderPinnedSelf() {
  // Remove any existing pinned row
  const existing = document.getElementById('pinned-self-row');
  if (existing) existing.remove();

  // Only in overall (points) view, not map view
  if (lbSelectedMap) return;

  const auth = typeof getAuth === 'function' ? getAuth() : null;
  if (!auth) return;

  // Find the logged-in player in lbPlayers (sorted by points = global rank)
  const sorted = [...lbPlayers].sort((a, b) => b.kz_points - a.kz_points);
  const idx = sorted.findIndex(p => p.steamid === auth.steamid);

  const tr = document.createElement('tr');
  tr.id = 'pinned-self-row';
  tr.className = 'pinned-self-row';

  if (idx === -1) {
    // Player has no records yet — show a placeholder pinned row
    const nick = auth.nickname || 'You';
    const avatar = auth.avatar || '';
    tr.innerHTML = `
      <td><span class="rank">—</span></td>
      <td>
        <div class="player-cell">
          <img class="player-thumb" src="${avatar}" onerror="this.style.display='none'" />
          <a class="player-nick" href="profile.html?steamid=${auth.steamid}">${nick}</a>
          <span class="pinned-self-badge">📍 You</span>
        </div>
      </td>
      <td><span class="pts-cell">0</span></td>
      <td><span class="pos-cell">—</span></td>
      <td><span class="runs-cell">0 (0%)</span></td>
    `;
  } else {
    const p = sorted[idx];
    const rank = idx + 1;
    const rankClass = rank === 1 ? 'top1' : rank === 2 ? 'top2' : rank === 3 ? 'top3' : '';
    tr.innerHTML = `
      <td><span class="rank ${rankClass}">${rank}</span></td>
      <td>
        <div class="player-cell">
          <img class="player-thumb" src="${p.avatar || auth.avatar || ''}" onerror="this.style.display='none'" />
          ${flagImg(p.country)}<a class="player-nick" href="profile.html?steamid=${p.steamid}&country=${p.country || ''}">${p.nickname}</a>
          <span class="pinned-self-badge">📍 You</span>
        </div>
      </td>
      <td><span class="pts-cell">${Number(p.kz_points).toFixed(0)}</span></td>
      <td><span class="pos-cell">${fmtPlace(p.kz_place)}</span></td>
      <td><span class="runs-cell">${p.kz_maps || p.maps_list?.length || '—'}</span></td>
    `;
  }

  // Insert at very top of lbBody
  lbBody.insertBefore(tr, lbBody.firstChild);
}

// Load world leaderboard on startup
loadCountryPlayers('world');

// ── Filter button toggle ──
const filterBtn      = document.getElementById('filterBtn');
const filterDropdown = document.getElementById('filterDropdown');

filterBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  const isOpen = filterDropdown.classList.toggle('open');
  filterBtn.classList.toggle('active', isOpen);
});

document.addEventListener('click', () => {
  filterDropdown.classList.remove('open');
  filterBtn.classList.remove('active');
});

filterDropdown.addEventListener('click', (e) => e.stopPropagation());

// ── Country / Add yourself shared list ──
const ALL_COUNTRIES = [
  { code: 'af', name: 'Afghanistan', flag: '🇦🇫' },
  { code: 'al', name: 'Albania', flag: '🇦🇱' },
  { code: 'dz', name: 'Algeria', flag: '🇩🇿' },
  { code: 'ad', name: 'Andorra', flag: '🇦🇩' },
  { code: 'ao', name: 'Angola', flag: '🇦🇴' },
  { code: 'ag', name: 'Antigua and Barbuda', flag: '🇦🇬' },
  { code: 'ar', name: 'Argentina', flag: '🇦🇷' },
  { code: 'am', name: 'Armenia', flag: '🇦🇲' },
  { code: 'au', name: 'Australia', flag: '🇦🇺' },
  { code: 'at', name: 'Austria', flag: '🇦🇹' },
  { code: 'az', name: 'Azerbaijan', flag: '🇦🇿' },
  { code: 'bs', name: 'Bahamas', flag: '🇧🇸' },
  { code: 'bh', name: 'Bahrain', flag: '🇧🇭' },
  { code: 'bd', name: 'Bangladesh', flag: '🇧🇩' },
  { code: 'by', name: 'Belarus', flag: '🇧🇾' },
  { code: 'be', name: 'Belgium', flag: '🇧🇪' },
  { code: 'bz', name: 'Belize', flag: '🇧🇿' },
  { code: 'bj', name: 'Benin', flag: '🇧🇯' },
  { code: 'bt', name: 'Bhutan', flag: '🇧🇹' },
  { code: 'bo', name: 'Bolivia', flag: '🇧🇴' },
  { code: 'ba', name: 'Bosnia and Herzegovina', flag: '🇧🇦' },
  { code: 'bw', name: 'Botswana', flag: '🇧🇼' },
  { code: 'br', name: 'Brazil', flag: '🇧🇷' },
  { code: 'bn', name: 'Brunei', flag: '🇧🇳' },
  { code: 'bg', name: 'Bulgaria', flag: '🇧🇬' },
  { code: 'bf', name: 'Burkina Faso', flag: '🇧🇫' },
  { code: 'bi', name: 'Burundi', flag: '🇧🇮' },
  { code: 'cv', name: 'Cape Verde', flag: '🇨🇻' },
  { code: 'kh', name: 'Cambodia', flag: '🇰🇭' },
  { code: 'cm', name: 'Cameroon', flag: '🇨🇲' },
  { code: 'ca', name: 'Canada', flag: '🇨🇦' },
  { code: 'cf', name: 'Central African Republic', flag: '🇨🇫' },
  { code: 'td', name: 'Chad', flag: '🇹🇩' },
  { code: 'cl', name: 'Chile', flag: '🇨🇱' },
  { code: 'cn', name: 'China', flag: '🇨🇳' },
  { code: 'co', name: 'Colombia', flag: '🇨🇴' },
  { code: 'km', name: 'Comoros', flag: '🇰🇲' },
  { code: 'cg', name: 'Congo', flag: '🇨🇬' },
  { code: 'cr', name: 'Costa Rica', flag: '🇨🇷' },
  { code: 'hr', name: 'Croatia', flag: '🇭🇷' },
  { code: 'cu', name: 'Cuba', flag: '🇨🇺' },
  { code: 'cy', name: 'Cyprus', flag: '🇨🇾' },
  { code: 'cz', name: 'Czech Republic', flag: '🇨🇿' },
  { code: 'dk', name: 'Denmark', flag: '🇩🇰' },
  { code: 'dj', name: 'Djibouti', flag: '🇩🇯' },
  { code: 'do', name: 'Dominican Republic', flag: '🇩🇴' },
  { code: 'ec', name: 'Ecuador', flag: '🇪🇨' },
  { code: 'eg', name: 'Egypt', flag: '🇪🇬' },
  { code: 'sv', name: 'El Salvador', flag: '🇸🇻' },
  { code: 'gq', name: 'Equatorial Guinea', flag: '🇬🇶' },
  { code: 'er', name: 'Eritrea', flag: '🇪🇷' },
  { code: 'ee', name: 'Estonia', flag: '🇪🇪' },
  { code: 'sz', name: 'Eswatini', flag: '🇸🇿' },
  { code: 'et', name: 'Ethiopia', flag: '🇪🇹' },
  { code: 'fj', name: 'Fiji', flag: '🇫🇯' },
  { code: 'fi', name: 'Finland', flag: '🇫🇮' },
  { code: 'fr', name: 'France', flag: '🇫🇷' },
  { code: 'ga', name: 'Gabon', flag: '🇬🇦' },
  { code: 'gm', name: 'Gambia', flag: '🇬🇲' },
  { code: 'ge', name: 'Georgia', flag: '🇬🇪' },
  { code: 'de', name: 'Germany', flag: '🇩🇪' },
  { code: 'gh', name: 'Ghana', flag: '🇬🇭' },
  { code: 'gr', name: 'Greece', flag: '🇬🇷' },
  { code: 'gt', name: 'Guatemala', flag: '🇬🇹' },
  { code: 'gn', name: 'Guinea', flag: '🇬🇳' },
  { code: 'gw', name: 'Guinea-Bissau', flag: '🇬🇼' },
  { code: 'gy', name: 'Guyana', flag: '🇬🇾' },
  { code: 'ht', name: 'Haiti', flag: '🇭🇹' },
  { code: 'hn', name: 'Honduras', flag: '🇭🇳' },
  { code: 'hu', name: 'Hungary', flag: '🇭🇺' },
  { code: 'hk', name: 'Hong Kong', flag: '🇭🇰' },
  { code: 'is', name: 'Iceland', flag: '🇮🇸' },
  { code: 'in', name: 'India', flag: '🇮🇳' },
  { code: 'id', name: 'Indonesia', flag: '🇮🇩' },
  { code: 'ir', name: 'Iran', flag: '🇮🇷' },
  { code: 'iq', name: 'Iraq', flag: '🇮🇶' },
  { code: 'ie', name: 'Ireland', flag: '🇮🇪' },
  { code: 'il', name: 'Israel', flag: '🇮🇱' },
  { code: 'it', name: 'Italy', flag: '🇮🇹' },
  { code: 'jm', name: 'Jamaica', flag: '🇯🇲' },
  { code: 'jp', name: 'Japan', flag: '🇯🇵' },
  { code: 'jo', name: 'Jordan', flag: '🇯🇴' },
  { code: 'kz', name: 'Kazakhstan', flag: '🇰🇿' },
  { code: 'ke', name: 'Kenya', flag: '🇰🇪' },
  { code: 'kw', name: 'Kuwait', flag: '🇰🇼' },
  { code: 'kg', name: 'Kyrgyzstan', flag: '🇰🇬' },
  { code: 'la', name: 'Laos', flag: '🇱🇦' },
  { code: 'lv', name: 'Latvia', flag: '🇱🇻' },
  { code: 'lb', name: 'Lebanon', flag: '🇱🇧' },
  { code: 'ls', name: 'Lesotho', flag: '🇱🇸' },
  { code: 'lr', name: 'Liberia', flag: '🇱🇷' },
  { code: 'ly', name: 'Libya', flag: '🇱🇾' },
  { code: 'li', name: 'Liechtenstein', flag: '🇱🇮' },
  { code: 'lt', name: 'Lithuania', flag: '🇱🇹' },
  { code: 'lu', name: 'Luxembourg', flag: '🇱🇺' },
  { code: 'mg', name: 'Madagascar', flag: '🇲🇬' },
  { code: 'mw', name: 'Malawi', flag: '🇲🇼' },
  { code: 'my', name: 'Malaysia', flag: '🇲🇾' },
  { code: 'mv', name: 'Maldives', flag: '🇲🇻' },
  { code: 'ml', name: 'Mali', flag: '🇲🇱' },
  { code: 'mt', name: 'Malta', flag: '🇲🇹' },
  { code: 'mr', name: 'Mauritania', flag: '🇲🇷' },
  { code: 'mu', name: 'Mauritius', flag: '🇲🇺' },
  { code: 'mx', name: 'Mexico', flag: '🇲🇽' },
  { code: 'md', name: 'Moldova', flag: '🇲🇩' },
  { code: 'mc', name: 'Monaco', flag: '🇲🇨' },
  { code: 'mn', name: 'Mongolia', flag: '🇲🇳' },
  { code: 'me', name: 'Montenegro', flag: '🇲🇪' },
  { code: 'ma', name: 'Morocco', flag: '🇲🇦' },
  { code: 'mz', name: 'Mozambique', flag: '🇲🇿' },
  { code: 'mm', name: 'Myanmar', flag: '🇲🇲' },
  { code: 'na', name: 'Namibia', flag: '🇳🇦' },
  { code: 'np', name: 'Nepal', flag: '🇳🇵' },
  { code: 'nl', name: 'Netherlands', flag: '🇳🇱' },
  { code: 'nz', name: 'New Zealand', flag: '🇳🇿' },
  { code: 'ni', name: 'Nicaragua', flag: '🇳🇮' },
  { code: 'ne', name: 'Niger', flag: '🇳🇪' },
  { code: 'ng', name: 'Nigeria', flag: '🇳🇬' },
  { code: 'mk', name: 'North Macedonia', flag: '🇲🇰' },
  { code: 'no', name: 'Norway', flag: '🇳🇴' },
  { code: 'om', name: 'Oman', flag: '🇴🇲' },
  { code: 'pk', name: 'Pakistan', flag: '🇵🇰' },
  { code: 'pa', name: 'Panama', flag: '🇵🇦' },
  { code: 'pg', name: 'Papua New Guinea', flag: '🇵🇬' },
  { code: 'py', name: 'Paraguay', flag: '🇵🇾' },
  { code: 'pe', name: 'Peru', flag: '🇵🇪' },
  { code: 'ph', name: 'Philippines', flag: '🇵🇭' },
  { code: 'pl', name: 'Poland', flag: '🇵🇱' },
  { code: 'pt', name: 'Portugal', flag: '🇵🇹' },
  { code: 'qa', name: 'Qatar', flag: '🇶🇦' },
  { code: 'ro', name: 'Romania', flag: '🇷🇴' },
  { code: 'ru', name: 'Russia', flag: '🇷🇺' },
  { code: 'rw', name: 'Rwanda', flag: '🇷🇼' },
  { code: 'sa', name: 'Saudi Arabia', flag: '🇸🇦' },
  { code: 'sn', name: 'Senegal', flag: '🇸🇳' },
  { code: 'rs', name: 'Serbia', flag: '🇷🇸' },
  { code: 'sl', name: 'Sierra Leone', flag: '🇸🇱' },
  { code: 'sg', name: 'Singapore', flag: '🇸🇬' },
  { code: 'sk', name: 'Slovakia', flag: '🇸🇰' },
  { code: 'si', name: 'Slovenia', flag: '🇸🇮' },
  { code: 'so', name: 'Somalia', flag: '🇸🇴' },
  { code: 'za', name: 'South Africa', flag: '🇿🇦' },
  { code: 'kr', name: 'South Korea', flag: '🇰🇷' },
  { code: 'ss', name: 'South Sudan', flag: '🇸🇸' },
  { code: 'es', name: 'Spain', flag: '🇪🇸' },
  { code: 'lk', name: 'Sri Lanka', flag: '🇱🇰' },
  { code: 'sd', name: 'Sudan', flag: '🇸🇩' },
  { code: 'sr', name: 'Suriname', flag: '🇸🇷' },
  { code: 'se', name: 'Sweden', flag: '🇸🇪' },
  { code: 'ch', name: 'Switzerland', flag: '🇨🇭' },
  { code: 'sy', name: 'Syria', flag: '🇸🇾' },
  { code: 'tw', name: 'Taiwan', flag: '🇹🇼' },
  { code: 'tj', name: 'Tajikistan', flag: '🇹🇯' },
  { code: 'tz', name: 'Tanzania', flag: '🇹🇿' },
  { code: 'th', name: 'Thailand', flag: '🇹🇭' },
  { code: 'tl', name: 'Timor-Leste', flag: '🇹🇱' },
  { code: 'tg', name: 'Togo', flag: '🇹🇬' },
  { code: 'tt', name: 'Trinidad and Tobago', flag: '🇹🇹' },
  { code: 'tn', name: 'Tunisia', flag: '🇹🇳' },
  { code: 'tr', name: 'Turkey', flag: '🇹🇷' },
  { code: 'tm', name: 'Turkmenistan', flag: '🇹🇲' },
  { code: 'ug', name: 'Uganda', flag: '🇺🇬' },
  { code: 'ua', name: 'Ukraine', flag: '🇺🇦' },
  { code: 'ae', name: 'United Arab Emirates', flag: '🇦🇪' },
  { code: 'gb', name: 'United Kingdom', flag: '🇬🇧' },
  { code: 'us', name: 'United States', flag: '🇺🇸' },
  { code: 'uy', name: 'Uruguay', flag: '🇺🇾' },
  { code: 'uz', name: 'Uzbekistan', flag: '🇺🇿' },
  { code: 've', name: 'Venezuela', flag: '🇻🇪' },
  { code: 'vn', name: 'Vietnam', flag: '🇻🇳' },
  { code: 'ye', name: 'Yemen', flag: '🇾🇪' },
  { code: 'zm', name: 'Zambia', flag: '🇿🇲' },
  { code: 'zw', name: 'Zimbabwe', flag: '🇿🇼' },
  { code: 'va', name: 'Vatican City', flag: '🇻🇦' },
];

// ── Country selector ──
const COUNTRIES = ALL_COUNTRIES;

let selectedCountry = null;
const countryBtn     = document.getElementById('countryBtn');
const countryOptions = document.getElementById('countryOptions');
const countryChevron = document.getElementById('countryChevron');
const countrySearch  = document.getElementById('countrySearch');
const countryList    = document.getElementById('countryList');

function renderCountries(filter = '') {
  countryList.innerHTML = '';
  const filtered = COUNTRIES.filter(c => c.name.toLowerCase().includes(filter.toLowerCase()));
  filtered.forEach(c => {
    const item = document.createElement('div');
    item.className = 'country-item' + (selectedCountry?.code === c.code ? ' active' : '');
    item.innerHTML = `<span class="country-flag">${c.flag}</span><span>${c.name}</span>`;
    item.addEventListener('click', () => {
      if (c.code === 'pt') window.location.assign('portugal.html');
      else window.location.assign(`${c.code}.html`);
    });
    countryList.appendChild(item);
  });
}

countryBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  countryOptions.classList.toggle('hidden');
  countryChevron.classList.toggle('rotated', !countryOptions.classList.contains('hidden'));
  if (!countryOptions.classList.contains('hidden')) {
    renderCountries();
    countrySearch.focus();
  }
});

countrySearch.addEventListener('input', () => renderCountries(countrySearch.value));
countrySearch.addEventListener('click', e => e.stopPropagation());
countryList.addEventListener('click', e => e.stopPropagation());

// ── Tier expand ──
const tierBtn     = document.getElementById('tierBtn');
const tierOptions = document.getElementById('tierOptions');
const chevron     = tierBtn.querySelector('.chevron');

tierBtn.addEventListener('click', () => {
  const isOpen = tierOptions.classList.toggle('open');
  chevron.classList.toggle('rotated', isOpen);
});

document.querySelectorAll('.tier-chip').forEach(chip => {
  chip.addEventListener('click', (e) => {
    e.stopPropagation();
    window.location.href = `tier.html?tier=${chip.dataset.tier}`;
  });
});

// ── Maps button ──
const mapsBtn = document.getElementById('mapsBtn');
mapsBtn.addEventListener('click', () => {
  window.location.href = 'maps.html';
});

// ── Add yourself ──

const CHIP_COUNTRIES = ['pt','es','fr','de','br','pl','tr','ru','gb'];

let addSelectedCountry = null;
let userPickedCountry = false;

document.querySelectorAll('#addCountryList .country-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('#addCountryList .country-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    addSelectedCountry = chip.dataset.country;
    userPickedCountry = true;
    document.getElementById('addCountryDropdown').classList.add('hidden');
  });
});

// Other dropdown
const otherBtn       = document.getElementById('otherCountryBtn');
const addDropdown    = document.getElementById('addCountryDropdown');
const addSearch      = document.getElementById('addCountrySearch');
const addOptions     = document.getElementById('addCountryOptions');

function renderAddCountryOptions(filter = '') {
  addOptions.innerHTML = '';
  ALL_COUNTRIES.filter(c => !CHIP_COUNTRIES.includes(c.code) && c.name.toLowerCase().includes(filter.toLowerCase()))
    .forEach(c => {
      const el = document.createElement('div');
      el.className = 'add-country-option' + (addSelectedCountry === c.code ? ' active' : '');
      el.textContent = `${c.flag} ${c.name}`;
      el.addEventListener('click', () => {
        addSelectedCountry = c.code;
        userPickedCountry = true;
        otherBtn.textContent = `${c.flag} ${c.name} ▾`;
        otherBtn.classList.add('active');
        document.querySelectorAll('#addCountryList .country-chip').forEach(ch => ch.classList.remove('active'));
        addDropdown.classList.add('hidden');
      });
      addOptions.appendChild(el);
    });
}

otherBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  const isHidden = addDropdown.classList.contains('hidden');
  addDropdown.classList.toggle('hidden');
  if (isHidden) {
    const rect = otherBtn.getBoundingClientRect();
    const dropH = 260;
    const spaceBelow = window.innerHeight - rect.bottom;
    if (spaceBelow < dropH) {
      addDropdown.style.top = (rect.top - dropH - 6) + 'px';
    } else {
      addDropdown.style.top = (rect.bottom + 6) + 'px';
    }
    addDropdown.style.left = rect.left + 'px';
    renderAddCountryOptions();
    addSearch.focus();
  }
});

addSearch.addEventListener('input', () => renderAddCountryOptions(addSearch.value));
addSearch.addEventListener('click', e => e.stopPropagation());
addOptions.addEventListener('click', e => e.stopPropagation());

document.addEventListener('click', () => addDropdown.classList.add('hidden'));

document.getElementById('addYourselfSubmit').addEventListener('click', async () => {
  const input = document.getElementById('addSteamInput').value.trim();
  const statusEl = document.getElementById('addYourselfStatus');
  const submitBtn = document.getElementById('addYourselfSubmit');

  if (!input) {
    showAddStatus('error', 'Please paste your Steam profile link or Steam64 ID.');
    return;
  }

  submitBtn.disabled = true;
  showAddStatus('loading', 'Resolving profile…');

  let steamid = null;
  let autoCountry = null;

  if (input.includes('faceit.com')) {
    const faceit = await resolveFaceit(input);
    if (!faceit || !faceit.steamid) {
      showAddStatus('error', 'Could not find this Faceit profile. Make sure the URL is correct.');
      submitBtn.disabled = false;
      return;
    }
    steamid = faceit.steamid;
    autoCountry = faceit.country;
  } else {
    steamid = await resolveSteamId(extractIdentifier(input));
    if (steamid) {
      // Try to get country from Faceit using steamid
      showAddStatus('loading', 'Looking up country…');
      try {
        const fcRes = await fetch(`https://kzlb.vercel.app/api/faceit-country?steamid=${steamid}`);
        if (fcRes.ok) {
          const fcData = await fcRes.json();
          if (fcData.country) autoCountry = fcData.country;
        }
      } catch {}
    }
  }

  if (!steamid) {
    showAddStatus('error', 'Could not find a valid Steam64 ID. Try pasting your Steam, Faceit, or Cybershoke profile URL.');
    submitBtn.disabled = false;
    return;
  }

  // Auto-detect country from Faceit — show confirmation modal if not manually picked
  if (autoCountry && !userPickedCountry) {
    const match = ALL_COUNTRIES.find(c => c.code === autoCountry.toLowerCase());
    if (match) {
      // Show modal and wait for user to confirm or cancel
      const confirmed = await new Promise(resolve => {
        const overlay = document.getElementById('countryConfirmOverlay');
        document.getElementById('countryConfirmFlag').textContent = match.flag;
        document.getElementById('countryConfirmName').textContent = match.name;
        overlay.style.display = 'flex';
        showAddStatus('', '');
        document.getElementById('countryConfirmYes').onclick = () => { overlay.style.display = 'none'; resolve(true); };
        document.getElementById('countryConfirmNo').onclick = () => { overlay.style.display = 'none'; resolve(false); };
      });

      if (confirmed) {
        addSelectedCountry = match.code;
        document.querySelectorAll('#addCountryList .country-chip').forEach(c => c.classList.remove('active'));
        const chip = document.querySelector(`#addCountryList .country-chip[data-country="${match.code}"]`);
        if (chip) chip.classList.add('active');
        else { otherBtn.textContent = `${match.flag} ${match.name} ▾`; otherBtn.classList.add('active'); }
      } else {
        // User wants to pick manually — re-enable and stop here
        showAddStatus('error', 'Please select your correct country below.');
        submitBtn.disabled = false;
        return;
      }
    }
  }

  if (!addSelectedCountry) {
    showAddStatus('error', 'Please select your country.');
    submitBtn.disabled = false;
    return;
  }

  const countryToSubmit = addSelectedCountry;

  // Check if player already exists in world leaderboard
  showAddStatus('loading', 'Checking if you\'re already on the leaderboard…');
  try {
    const worldRes = await fetch(`${CACHE_BASE}/world-kz-players.json?bust=${Date.now()}`);
    if (worldRes.ok) {
      const worldData = await worldRes.json();
      const exists = (worldData.players || []).find(p => p.steamid === steamid);
      if (exists) {
        showAddStatus('error', `Player "${exists.nickname}" is already on the leaderboard! Use "Update your records" to refresh your stats.`);
        submitBtn.disabled = false;
        return;
      }
    }
  } catch {}

  showAddStatus('loading', 'Submitting… this may take a few minutes while we fetch your stats.');

  try {
    const res = await fetch(`https://kzlb.vercel.app/api/add-player?steamid=${steamid}&country=${countryToSubmit}`);
    const data = await res.json();

    if (data.ok) {
      submitBtn.disabled = false;
      // Start live timer + poll for profile completion
      const startTime = Date.now();
      const submittedSteamid = steamid;
      const submittedCountry = countryToSubmit;

      function fmtElapsed() {
        const secs = Math.floor((Date.now() - startTime) / 1000);
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        return `${m}:${String(s).padStart(2, '0')}`;
      }

      const timerInterval = setInterval(() => {
        showAddStatus('loading', `⏳ Processing your stats… ${fmtElapsed()} (approx. less than 1 min)`);
      }, 1000);

      showAddStatus('loading', '⏳ Processing your stats… 0:00 (approx. less than 1 min)');

      async function pollForProfile() {
        try {
          const cacheRes = await fetch(`${CACHE_BASE}/${submittedSteamid}.json?bust=${Date.now()}`);
          if (cacheRes.ok) {
            const cacheData = await cacheRes.json();
            const cachedAt = new Date(cacheData.cached_at).getTime();
            if (cachedAt >= startTime) {
              // Profile is ready
              clearInterval(timerInterval);
              showAddStatus('success', `✅ Done! Opening profile… (took ${fmtElapsed()})`);
              setTimeout(() => {
                window.location.href = `profile.html?steamid=${submittedSteamid}&country=${submittedCountry}`;
              }, 1500);
              return;
            }
          }
        } catch {}
        // Not ready yet, check again in 15s
        setTimeout(pollForProfile, 15000);
      }

      // Start polling after 30s (workflow takes at least that long)
      setTimeout(pollForProfile, 30000);

    } else {
      showAddStatus('error', 'Something went wrong. Try again later.');
      submitBtn.disabled = false;
    }
  } catch (e) {
    showAddStatus('error', 'Could not reach the server: ' + e.message);
    submitBtn.disabled = false;
  }
});

// ── Update records ──
document.getElementById('updateSubmit').addEventListener('click', async () => {
  const input = document.getElementById('updateInput').value.trim();
  const submitBtn = document.getElementById('updateSubmit');

  if (!input) {
    showUpdateStatus('error', 'Please paste your Steam, Faceit or Cybershoke link.');
    return;
  }

  submitBtn.disabled = true;
  showUpdateStatus('loading', 'Resolving profile…');

  let steamid = null;

  if (input.includes('faceit.com')) {
    const faceit = await resolveFaceit(input);
    steamid = faceit?.steamid || null;
  } else {
    steamid = await resolveSteamId(extractIdentifier(input));
  }

  if (!steamid) {
    showUpdateStatus('error', 'Could not find a valid Steam ID. Try your Steam or Faceit profile URL.');
    submitBtn.disabled = false;
    return;
  }

  showUpdateStatus('loading', 'Updating… this may take a few minutes.');

  try {
    const res = await fetch(`https://kzlb.vercel.app/api/update-player?steamid=${steamid}`);
    const data = await res.json();
    if (data.ok) {
      showUpdateStatus('success', 'Update triggered! Your records will refresh in a few minutes.');
    } else {
      const errMsg = data.error?.includes('not found') ? 'Player not found in leaderboard. Use "Add to the leaderboard" first.' : (data.error || 'Something went wrong. Are you on the leaderboard yet?');
      showUpdateStatus('error', errMsg);
    }
  } catch (e) {
    showUpdateStatus('error', 'Could not reach the server. Try again later.');
  } finally {
    submitBtn.disabled = false;
  }
});

function showUpdateStatus(type, msg) {
  const el = document.getElementById('updateStatus');
  el.className = `add-yourself-status ${type}`;
  el.textContent = msg;
  el.classList.remove('hidden');
}

// ── Search autocomplete ──
let allPlayersCache = null;
const searchInput = document.getElementById('searchInput');
const searchSuggestions = document.getElementById('searchSuggestions');

async function getAllPlayers() {
  if (allPlayersCache) return allPlayersCache;
  try {
    const res = await fetch(`${CACHE_BASE}/world-kz-players.json?bust=${Date.now()}`);
    const data = await res.json();
    allPlayersCache = data.players || [];
  } catch { allPlayersCache = []; }
  return allPlayersCache;
}

function highlightMatch(text, query) {
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return text.slice(0, idx) + '<em>' + text.slice(idx, idx + query.length) + '</em>' + text.slice(idx + query.length);
}

searchInput.addEventListener('input', async () => {
  const q = searchInput.value.trim();
  // Only show suggestions for nickname searches (not URLs/steamids)
  if (q.length < 2 || q.includes('.') || q.includes('/') || /^\d{6,}$/.test(q)) {
    searchSuggestions.classList.add('hidden');
    return;
  }
  const players = await getAllPlayers();
  const matches = players.filter(p => p.nickname?.toLowerCase().includes(q.toLowerCase())).slice(0, 8);
  if (!matches.length) { searchSuggestions.classList.add('hidden'); return; }

  searchSuggestions.innerHTML = matches.map(p => {
    const flagHtml = p.country && p.country !== 'xx'
      ? `<img class="search-suggestion-flag" src="https://flagcdn.com/w20/${p.country}.png" onerror="this.style.display='none'">`
      : '';
    const avatarSrc = p.avatar || 'https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg';
    return `<div class="search-suggestion-item" data-steamid="${p.steamid}" data-country="${p.country || 'xx'}">
      <img class="search-suggestion-avatar" src="${avatarSrc}" onerror="this.src='https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg'">
      <div class="search-suggestion-info">
        <div class="search-suggestion-nick">${highlightMatch(p.nickname, q)}</div>
        <div class="search-suggestion-meta">${flagHtml} ${p.kz_points != null ? Number(p.kz_points).toLocaleString() + ' pts' : '0 pts'}</div>
      </div>
    </div>`;
  }).join('');

  searchSuggestions.querySelectorAll('.search-suggestion-item').forEach(el => {
    el.addEventListener('click', () => {
      const sid = el.dataset.steamid;
      const country = el.dataset.country;
      searchSuggestions.classList.add('hidden');
      window.location.href = `profile.html?steamid=${sid}&country=${country}`;
    });
  });

  searchSuggestions.classList.remove('hidden');
});

searchInput.addEventListener('keydown', e => {
  if (e.key === 'Escape') searchSuggestions.classList.add('hidden');
});

document.addEventListener('click', e => {
  if (!e.target.closest('.search-bar-wrapper')) searchSuggestions.classList.add('hidden');
});

async function resolveFaceit(input) {
  try {
    const res = await fetch(`https://kzlb.vercel.app/api/faceit-resolve?input=${encodeURIComponent(input)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

function showAddStatus(type, msg) {
  const el = document.getElementById('addYourselfStatus');
  el.className = `add-yourself-status ${type}`;
  el.textContent = msg;
  el.classList.remove('hidden');
  // Move Read me button below the status box so it doesn't overlap
  const readmeWrap = document.querySelector('#addYourselfBox .readme-wrap');
  if (readmeWrap) {
    if (msg) {
      readmeWrap.style.position = 'relative';
      readmeWrap.style.bottom = 'auto';
      readmeWrap.style.right = 'auto';
      readmeWrap.style.marginTop = '8px';
      readmeWrap.style.marginBottom = '4px';
      readmeWrap.style.paddingRight = '4px';
      readmeWrap.style.textAlign = 'right';
    } else {
      readmeWrap.style.position = '';
      readmeWrap.style.marginTop = '';
      readmeWrap.style.textAlign = '';
    }
  }
}

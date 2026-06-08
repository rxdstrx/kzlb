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

const lbBody  = document.getElementById('leaderboard-body');
const lbEmpty = document.getElementById('lbEmpty');

function renderLeaderboard() {
  lbBody.innerHTML = '';
  lbEmpty.classList.add('hidden');

  if (!lbPlayers.length) {
    lbEmpty.textContent = selectedCountry
      ? `No KZ data found for ${selectedCountry.name} players.`
      : 'Select a country from the filter to load players.';
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

    rows.forEach((p, i) => {
      const rank = i + 1;
      const rankClass = rank === 1 ? 'top1' : rank === 2 ? 'top2' : rank === 3 ? 'top3' : '';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><span class="rank ${rankClass}">${rank}</span></td>
        <td>
          <div class="player-cell">
            <img class="player-thumb" src="${p.avatar}" onerror="this.style.display='none'" />
            <a class="player-nick" href="profile.html?steamid=${p.steamid}">${p.nickname}</a>
          </div>
        </td>
        <td><span class="time-cell">${p.entry.time_record}</span></td>
        <td><span class="pos-cell">${p.entry.place_num}</span></td>
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

    rows.forEach((p, i) => {
      const rank = i + 1;
      const rankClass = rank === 1 ? 'top1' : rank === 2 ? 'top2' : rank === 3 ? 'top3' : '';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><span class="rank ${rankClass}">${rank}</span></td>
        <td>
          <div class="player-cell">
            <img class="player-thumb" src="${p.avatar}" onerror="this.style.display='none'" />
            <a class="player-nick" href="profile.html?steamid=${p.steamid}">${p.nickname}</a>
          </div>
        </td>
        <td><span class="pts-cell">${Number(p.kz_points).toFixed(0)}</span></td>
        <td><span class="pos-cell">#${p.kz_place?.toLocaleString() || '—'}</span></td>
        <td><span class="runs-cell">${p.kz_maps || p.maps_list?.length || '—'}</span></td>
      `;
      lbBody.appendChild(tr);
    });
  }
}

async function loadCountryPlayers(code) {
  if (code === 'pt') {
    if (!COUNTRY_CACHE.pt) {
      lbBody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:24px;color:rgba(255,255,255,0.3)">Loading...</td></tr>';
      const res = await fetch(`${CACHE_BASE}/pt-kz-players.json?bust=${Date.now()}`);
      const data = await res.json();
      COUNTRY_CACHE.pt = data.players || [];
    }
    lbPlayers = COUNTRY_CACHE.pt;
    renderLeaderboard();
  }
}

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
      if (c.code === 'pt') {
        window.location.assign('portugal.html');
      } else {
        window.location.assign(`country.html?code=${c.code}`);
      }
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
];

const CHIP_COUNTRIES = ['pt','es','fr','de','br','pl','tr','ru','gb'];

let addSelectedCountry = 'pt';

document.querySelectorAll('#addCountryList .country-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('#addCountryList .country-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    addSelectedCountry = chip.dataset.country;
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
  showAddStatus('loading', 'Resolving Steam ID…');

  const steamid = await resolveSteamId(input);
  if (!steamid) {
    showAddStatus('error', 'Could not find a valid Steam64 ID. Try pasting your full Steam profile URL.');
    submitBtn.disabled = false;
    return;
  }

  showAddStatus('loading', 'Submitting… this may take a few minutes while we fetch your stats.');

  try {
    const res = await fetch(`https://kzlb.vercel.app/api/add-player?steamid=${steamid}&country=${addSelectedCountry}`);
    const data = await res.json();

    if (data.ok) {
      showAddStatus('success', 'You\'ve been submitted! Your stats will appear on the leaderboard in a few minutes after the workflow completes.');
    } else {
      showAddStatus('error', 'Something went wrong. Try again later.');
    }
  } catch (e) {
    showAddStatus('error', 'Could not reach the server: ' + e.message);
  } finally {
    submitBtn.disabled = false;
  }
});

function showAddStatus(type, msg) {
  const el = document.getElementById('addYourselfStatus');
  el.className = `add-yourself-status ${type}`;
  el.textContent = msg;
  el.classList.remove('hidden');
}

const CACHE_BASE = 'https://raw.githubusercontent.com/rxdstrx/kzlb/main/cache';
const API_BASE = 'https://kzlb.vercel.app';

const CIRCUMFERENCE = 264;
const STEPS = [
  { at: 0,   pct: 0,   label: 'Triggering scrape…',      sub: 'Starting GitHub Action' },
  { at: 8,   pct: 15,  label: 'Action queued…',           sub: 'Waiting for a runner' },
  { at: 18,  pct: 30,  label: 'Launching browser…',       sub: 'Setting up Puppeteer' },
  { at: 30,  pct: 50,  label: 'Loading player page…',     sub: 'Connecting to Cybershoke' },
  { at: 42,  pct: 65,  label: 'Fetching KZ stats…',       sub: 'Reading map records' },
  { at: 55,  pct: 80,  label: 'Saving data…',             sub: 'Committing to cache' },
  { at: 68,  pct: 92,  label: 'Almost done…',             sub: 'Finalizing' },
];

let progressInterval = null;

function startProgress() {
  const circle  = document.getElementById('progressCircle');
  const pctEl   = document.getElementById('progressPct');
  const stepEl  = document.getElementById('loadingStep');
  const subEl   = document.getElementById('loadingSub');
  if (!circle) return;

  let elapsed = 0;
  progressInterval = setInterval(() => {
    elapsed++;
    const step = [...STEPS].reverse().find(s => elapsed >= s.at) || STEPS[0];
    const nextStep = STEPS[STEPS.indexOf(step) + 1];
    let pct = step.pct;
    if (nextStep) {
      const segProgress = (elapsed - step.at) / (nextStep.at - step.at);
      pct = step.pct + (nextStep.pct - step.pct) * Math.min(segProgress, 1);
    }
    pct = Math.min(pct, 96);
    circle.style.strokeDashoffset = CIRCUMFERENCE - (CIRCUMFERENCE * pct / 100);
    pctEl.textContent = Math.round(pct) + '%';
    stepEl.textContent = step.label;
    subEl.textContent  = step.sub;
  }, 1000);
}

function stopProgress() {
  clearInterval(progressInterval);
  const circle = document.getElementById('progressCircle');
  const pctEl  = document.getElementById('progressPct');
  if (circle) {
    circle.style.stroke = '#34d399';
    circle.style.strokeDashoffset = '0';
  }
  if (pctEl) pctEl.textContent = '100%';
}

const params = new URLSearchParams(window.location.search);
const steamid = params.get('steamid');
const urlCountry = params.get('country');

function countryToFlag(code) {
  if (!code || code.length !== 2) return '';
  return code.toUpperCase().replace(/./g, c => String.fromCodePoint(c.charCodeAt(0) + 127397));
}


const loadingState   = document.getElementById('loadingState');
const errorState     = document.getElementById('errorState');
const profileContent = document.getElementById('profileContent');
const errorMsg       = document.getElementById('errorMsg');

function showError(msg) {
  loadingState.classList.add('hidden');
  errorState.classList.remove('hidden');
  errorMsg.textContent = msg;
}

if (!steamid) {
  showError('No Steam ID provided. Please go back and search again.');
} else {
  loadProfile(steamid);
}

async function loadProfile(sid) {
  try {
    // Try to load cached data from GitHub
    const cacheRes = await fetch(`${CACHE_BASE}/${sid}.json?bust=${Date.now()}`);

    if (!cacheRes.ok) {
      triggerScrape(sid);
      startProgress();
      const loadingLink = document.getElementById('loadingCybershokeLink');
      if (loadingLink) {
        loadingLink.href = `https://cybershoke.net/ru/cs2/leaderboard/kz/maps/${sid}`;
        loadingLink.classList.remove('hidden');
      }
      setTimeout(() => pollForCache(sid), 10000);
      return;
    }

    const data = await cacheRes.json();

    // Player info from maps.header or user mode 18
    const header = data.maps?.header || {};
    const kzUser = data.user?.['18'] || {};
    let name   = header.title || kzUser.name || '';
    let avatar = header.avatar || kzUser.avatar || '';

    // Fallback to Steam/playerdb if no name or avatar
    if (!name || !avatar) {
      try {
        const pdb = await fetch(`https://playerdb.co/api/player/steam/${sid}`);
        const pdbData = await pdb.json();
        const player = pdbData?.data?.player;
        if (player) {
          if (!name) name = player.username || 'Unknown Player';
          if (!avatar) avatar = player.avatar || '';
        }
      } catch {}
    }
    if (!name) name = 'Unknown Player';
    const desc   = header.desc || {};

    document.getElementById('playerSteamId').textContent = sid;
    document.getElementById('playerAvatar').src          = avatar;
    document.title = `KZ — ${name}`;

    const country = urlCountry || data.country || null;
    const flagEl = document.getElementById('playerFlag');
    const nameEl = document.getElementById('playerName');
    nameEl.childNodes[0].textContent = name;
    if (flagEl && country) flagEl.textContent = ' ' + countryToFlag(country);

    const csLink = `https://cybershoke.net/ru/cs2/leaderboard/kz/maps/${sid}`;
    const cybLink = document.getElementById('cybershokeLink');
    if (cybLink) cybLink.href = csLink;

    // Header stats
    setStatIfExists('statPosition',   desc['{{Position}}']        ?? kzUser.place   ?? '—');
    setStatIfExists('statPoints',     desc['{{Points}}']           ?? kzUser.points  ?? '—');
    setStatIfExists('statMaps',       desc['{{COMPLETIONS-MAP}}']  ?? '—');
    setStatIfExists('statBonus',      desc['{{COMPLETIONS-BONUS}}'] ?? '—');
    setStatIfExists('statWR',         desc['WR']                   ?? '—');
    setStatIfExists('statPBTop100',   desc['PB {{TOP-1}} 100']     ?? '—');

    // Maps table
    const mapList = (data.maps?.list || []).sort((a, b) => Number(a.tier) - Number(b.tier));
    renderMaps(mapList);

    // Cached time
    if (data.cached_at) {
      const ago = timeSince(new Date(data.cached_at));
      const el = document.getElementById('cachedAt');
      if (el) el.textContent = `Stats cached ${ago} ago`;
    }

    loadingState.classList.add('hidden');
    profileContent.classList.remove('hidden');

  } catch (e) {
    showError('Failed to load profile. ' + e.message);
  }
}

function setStatIfExists(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function renderMaps(mapList) {
  const statsBody = document.getElementById('statsBody');
  const noStats   = document.getElementById('noStats');

  if (!mapList.length) {
    if (noStats) noStats.classList.remove('hidden');
    return;
  }

  const mapLookup = {};
  if (typeof ALL_MAPS !== 'undefined') {
    ALL_MAPS.forEach(m => { mapLookup[m.name] = m; });
  }

  mapList.forEach(row => {
    const mapName = row.map || '—';
    const mapInfo = mapLookup[mapName] || {};
    const tier    = row.tier ?? '—';
    const runs    = row.completions ?? '—';
    const time    = row.time_record ?? '—';
    const pos     = row.place_num ?? '—';
    const pts     = row.points != null ? Number(row.points).toFixed(4) : '—';
    const d = row.unixtime_record ? new Date(row.unixtime_record * 1000) : null;
    const date = d
      ? `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}, ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
      : '—';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <div class="map-name-cell">
          ${mapInfo.img ? `<img class="map-thumb" src="${mapInfo.img}" alt="${mapName}">` : '<div class="map-thumb map-thumb-empty"></div>'}
          <span class="mapname-cell">${mapName}</span>
        </div>
      </td>
      <td><span class="tier-badge tier-${tier}">${tier}</span></td>
      <td><span class="runs-cell">${runs}</span></td>
      <td><span class="time-cell">${time}</span></td>
      <td><span class="pos-cell">${pos}</span></td>
      <td><span class="date-cell">${date}</span></td>
    `;
    statsBody.appendChild(tr);
  });
}

async function triggerScrape(sid) {
  try {
    await fetch(`${API_BASE}/api/trigger-scrape?steamid=${sid}`);
  } catch {}
}

async function pollForCache(sid, attempts = 0) {
  if (attempts > 24) {
    showError('Could not fetch stats after 4 minutes. Please refresh the page.');
    return;
  }
  const res = await fetch(`${CACHE_BASE}/${sid}.json?bust=${Date.now()}`).catch(() => null);
  if (res && res.ok) {
    stopProgress();
    await new Promise(r => setTimeout(r, 600));
    loadProfile(sid);
    return;
  }
  const dots = '.'.repeat((attempts % 3) + 1);
  loadingState.querySelector('p').textContent = `Fetching stats${dots} this takes ~2 minutes.`;
  setTimeout(() => pollForCache(sid, attempts + 1), 10000);
}

function timeSince(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

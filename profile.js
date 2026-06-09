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
  return `<img src="https://flagcdn.com/w40/${code.toLowerCase()}.png" alt="${code}" style="height:18px;border-radius:2px;vertical-align:middle;margin-left:6px;">`;
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

// ── Update record button ──
const updateRecordBtn = document.getElementById('updateRecordBtn');
const updateRecordStatus = document.getElementById('updateRecordStatus');
let originalCachedAt = null; // saved when profile loads

// Save original cached_at after profile loads
async function saveOriginalCachedAt() {
  try {
    const r = await fetch(`https://api.github.com/repos/rxdstrx/kzlb/contents/cache/${steamid}.json`);
    if (r.ok) {
      const meta = await r.json();
      const content = JSON.parse(atob(meta.content.replace(/\n/g, '')));
      originalCachedAt = content.cached_at;
    }
  } catch {}
}
if (steamid) saveOriginalCachedAt();

if (updateRecordBtn && steamid) {
  updateRecordBtn.addEventListener('click', async () => {
    updateRecordBtn.disabled = true;
    updateRecordStatus.className = 'update-record-status loading';
    updateRecordStatus.textContent = '⏳ Updating…';
    updateRecordStatus.classList.remove('hidden');

    try {
      const res = await fetch(`https://kzlb.vercel.app/api/update-player?steamid=${steamid}`);
      const data = await res.json();
      if (data.ok) {
        const startTime = Date.now();
        const timer = setInterval(() => {
          const secs = Math.floor((Date.now() - startTime) / 1000);
          const m = Math.floor(secs / 60), s = secs % 60;
          updateRecordStatus.textContent = `⏳ Processing… ${m}:${String(s).padStart(2,'0')} (approx. less than 1 min)`;
        }, 1000);
        updateRecordStatus.textContent = '⏳ Processing… 0:00 (approx. less than 1 min)';

        async function pollDone() {
          try {
            // Use GitHub API — bypasses CDN caching
            const r = await fetch(`https://api.github.com/repos/rxdstrx/kzlb/contents/cache/${steamid}.json`);
            if (r.ok) {
              const meta = await r.json();
              const content = JSON.parse(atob(meta.content.replace(/\n/g, '')));
              const newCachedAt = content.cached_at;
              if (newCachedAt && newCachedAt !== originalCachedAt) {
                clearInterval(timer);
                updateRecordStatus.className = 'update-record-status success';
                updateRecordStatus.textContent = '✅ Done! Reloading profile…';
                originalCachedAt = newCachedAt;
                setTimeout(() => window.location.reload(), 1500);
                return;
              }
            }
          } catch {}
          setTimeout(pollDone, 15000);
        }
        setTimeout(pollDone, 30000);

      } else {
        updateRecordStatus.className = 'update-record-status error';
        updateRecordStatus.textContent = data.error || 'Something went wrong.';
        updateRecordBtn.disabled = false;
      }
    } catch {
      updateRecordStatus.className = 'update-record-status error';
      updateRecordStatus.textContent = 'Could not reach the server. Try again later.';
      updateRecordBtn.disabled = false;
    }
  });
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
    if (flagEl && country) flagEl.innerHTML = countryToFlag(country);

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
    const pos     = (row.place_num ?? '—').replace(/\u00a0/g, ' ');
    const pts     = row.points != null ? Number(row.points).toFixed(4) : '—';
    const d = row.unixtime_record ? new Date(row.unixtime_record * 1000) : null;
    const date = d
      ? `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}, ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
      : '—';

    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    tr.addEventListener('click', () => {
      window.location.href = `map.html?map=${encodeURIComponent(mapName)}`;
    });
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

// ── Steam Login / Flag Change (uses auth.js getAuth()) ────────────────────────

const ALL_COUNTRIES_PROFILE = [
  { code: 'xx', name: 'No flag' },
  { code: 'af', name: 'Afghanistan' }, { code: 'al', name: 'Albania' }, { code: 'dz', name: 'Algeria' },
  { code: 'ar', name: 'Argentina' }, { code: 'am', name: 'Armenia' }, { code: 'au', name: 'Australia' },
  { code: 'at', name: 'Austria' }, { code: 'az', name: 'Azerbaijan' }, { code: 'by', name: 'Belarus' },
  { code: 'be', name: 'Belgium' }, { code: 'ba', name: 'Bosnia & Herzegovina' }, { code: 'br', name: 'Brazil' },
  { code: 'bg', name: 'Bulgaria' }, { code: 'ca', name: 'Canada' }, { code: 'cl', name: 'Chile' },
  { code: 'cn', name: 'China' }, { code: 'co', name: 'Colombia' }, { code: 'hr', name: 'Croatia' },
  { code: 'cy', name: 'Cyprus' }, { code: 'cz', name: 'Czechia' }, { code: 'dk', name: 'Denmark' },
  { code: 'eg', name: 'Egypt' }, { code: 'ee', name: 'Estonia' }, { code: 'fi', name: 'Finland' },
  { code: 'fr', name: 'France' }, { code: 'ge', name: 'Georgia' }, { code: 'de', name: 'Germany' },
  { code: 'gr', name: 'Greece' }, { code: 'hu', name: 'Hungary' }, { code: 'in', name: 'India' },
  { code: 'id', name: 'Indonesia' }, { code: 'ir', name: 'Iran' }, { code: 'ie', name: 'Ireland' },
  { code: 'il', name: 'Israel' }, { code: 'it', name: 'Italy' }, { code: 'jp', name: 'Japan' },
  { code: 'kz', name: 'Kazakhstan' }, { code: 'ke', name: 'Kenya' }, { code: 'kr', name: 'South Korea' },
  { code: 'kw', name: 'Kuwait' }, { code: 'lv', name: 'Latvia' }, { code: 'lt', name: 'Lithuania' },
  { code: 'lu', name: 'Luxembourg' }, { code: 'my', name: 'Malaysia' }, { code: 'mx', name: 'Mexico' },
  { code: 'md', name: 'Moldova' }, { code: 'me', name: 'Montenegro' }, { code: 'ma', name: 'Morocco' },
  { code: 'nl', name: 'Netherlands' }, { code: 'nz', name: 'New Zealand' }, { code: 'ng', name: 'Nigeria' },
  { code: 'mk', name: 'North Macedonia' }, { code: 'no', name: 'Norway' }, { code: 'pk', name: 'Pakistan' },
  { code: 'pa', name: 'Panama' }, { code: 'pe', name: 'Peru' }, { code: 'ph', name: 'Philippines' },
  { code: 'pl', name: 'Poland' }, { code: 'pt', name: 'Portugal' }, { code: 'qa', name: 'Qatar' },
  { code: 'ro', name: 'Romania' }, { code: 'ru', name: 'Russia' }, { code: 'sa', name: 'Saudi Arabia' },
  { code: 'rs', name: 'Serbia' }, { code: 'sg', name: 'Singapore' }, { code: 'sk', name: 'Slovakia' },
  { code: 'si', name: 'Slovenia' }, { code: 'za', name: 'South Africa' }, { code: 'es', name: 'Spain' },
  { code: 'se', name: 'Sweden' }, { code: 'ch', name: 'Switzerland' }, { code: 'tw', name: 'Taiwan' },
  { code: 'th', name: 'Thailand' }, { code: 'tr', name: 'Turkey' }, { code: 'ua', name: 'Ukraine' },
  { code: 'ae', name: 'United Arab Emirates' }, { code: 'gb', name: 'United Kingdom' },
  { code: 'us', name: 'United States' }, { code: 'uz', name: 'Uzbekistan' }, { code: 've', name: 'Venezuela' },
  { code: 'vn', name: 'Vietnam' },
];

function initSteamUI() {
  const auth = typeof getAuth === 'function' ? getAuth() : null;
  const token = auth ? auth.token : null;
  const loggedInSteamId = auth ? auth.steamid : null;
  const ownProfileActions = document.getElementById('ownProfileActions');
  const steamLoginBtn = document.getElementById('steamLoginBtn');
  const steamLogoutBtn = document.getElementById('steamLogoutBtn');
  const flagChangeSelect = document.getElementById('flagChangeSelect');
  const flagChangeBtn = document.getElementById('flagChangeBtn');
  const flagChangeStatus = document.getElementById('flagChangeStatus');

  if (!ownProfileActions || !steamLoginBtn) return;

  // Populate country select
  if (flagChangeSelect) {
    flagChangeSelect.innerHTML = ALL_COUNTRIES_PROFILE.map(c =>
      `<option value="${c.code}">${c.code !== 'xx' ? '🏳️ ' : ''}${c.name}</option>`
    ).join('');
  }

  if (token && loggedInSteamId && loggedInSteamId === steamid) {
    // Logged in and viewing own profile
    ownProfileActions.classList.remove('hidden');
    steamLoginBtn.classList.add('hidden');
  } else if (!token) {
    // Not logged in — show login button only on this profile page
    steamLoginBtn.classList.remove('hidden');
    ownProfileActions.classList.add('hidden');
  }
  // If logged in but viewing someone else's profile — show nothing

  // Logout
  if (steamLogoutBtn) {
    steamLogoutBtn.addEventListener('click', () => {
      if (typeof clearAuth === 'function') clearAuth();
      ownProfileActions.classList.add('hidden');
      steamLoginBtn.classList.remove('hidden');
    });
  }

  // Save flag
  if (flagChangeBtn) {
    flagChangeBtn.addEventListener('click', async () => {
      const country = flagChangeSelect.value;
      const currentToken = getStoredToken();
      if (!currentToken) return;

      flagChangeBtn.disabled = true;
      flagChangeStatus.textContent = '⏳ Saving…';
      flagChangeStatus.className = 'flag-change-status loading';
      flagChangeStatus.classList.remove('hidden');

      try {
        const r = await fetch('https://kzlb.vercel.app/api/change-flag', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: currentToken, country }),
        });
        const data = await r.json();
        if (r.ok && data.ok) {
          flagChangeStatus.textContent = '✅ Flag updated! Changes appear in ~2 min.';
          flagChangeStatus.className = 'flag-change-status success';
        } else {
          flagChangeStatus.textContent = '✗ ' + (data.error || 'Failed');
          flagChangeStatus.className = 'flag-change-status error';
          if (r.status === 401) {
            if (typeof clearAuth === 'function') clearAuth();
            ownProfileActions.classList.add('hidden');
            steamLoginBtn.classList.remove('hidden');
          }
        }
      } catch (err) {
        flagChangeStatus.textContent = '✗ Network error';
        flagChangeStatus.className = 'flag-change-status error';
      }
      flagChangeBtn.disabled = false;
    });
  }
}

// Init after profile loads (so steamid is set)
// We call it both immediately and after profile content shows
initSteamUI();
profileContent && new MutationObserver((_, obs) => {
  if (!profileContent.classList.contains('hidden')) {
    initSteamUI();
    obs.disconnect();
  }
}).observe(profileContent, { attributes: true, attributeFilter: ['class'] });

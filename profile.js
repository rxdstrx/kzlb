const CACHE_BASE = 'https://raw.githubusercontent.com/rxdstrx/kzlb/main/cache';
const API_BASE = 'https://kzlb.vercel.app';
const SB_URL = 'https://btcufotfvfnuoiokghjm.supabase.co';
const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0Y3Vmb3RmdmZudW9pb2tnaGptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDYzNzIwMTksImV4cCI6MjA2MTk0ODAxOX0.xBcCOKBIqeRSBnPCvHiSgaE4BOKIkyuAPaWKqfVGBpA';

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
  if (!code || code.length !== 2 || code === 'xx') return '';
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

async function fetchPlayerData(sid) {
  // 1. Check Supabase player_cache first (instant — written right after scrape)
  try {
    const sbRes = await fetch(
      `${SB_URL}/rest/v1/player_cache?steamid=eq.${sid}&select=data&limit=1`,
      { headers: { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}` } }
    );
    if (sbRes.ok) {
      const rows = await sbRes.json();
      if (rows.length && rows[0].data) {
        console.log('[profile] loaded from Supabase player_cache (instant)');
        return { ok: true, data: rows[0].data };
      }
    }
  } catch {}

  // 2. Fall back to GitHub raw CDN
  const cacheRes = await fetch(`${CACHE_BASE}/${sid}.json?bust=${Date.now()}`);
  if (!cacheRes.ok) return { ok: false };
  const data = await cacheRes.json();
  return { ok: true, data };
}

async function loadProfile(sid) {
  try {
    const [{ ok, data: cachedData }] = await Promise.all([
      fetchPlayerData(sid),
      loadMapTotals(),
    ]);
    const cacheRes = { ok, json: async () => cachedData };

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

    // Player was removed by admin — show empty profile, do not re-scrape
    if (data.removed) {
      showError('This player has been removed from the leaderboard.');
      return;
    }

    const header = data.maps?.header || {};
    const kzUser = data.user?.['18'] || {};
    let name   = data.nickname || header.title || kzUser.name || '';
    let avatar = header.avatar || kzUser.avatar || '';

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

    const desc    = header.desc || {};
    // For the logged-in player's own profile, use localStorage country (updates instantly on flag change)
    const lsCountry = (sid === localStorage.getItem('kz_steam_id')) ? localStorage.getItem('kz_country') : null;
    const cacheCountry = (data.country && data.country !== 'xx') ? data.country : null;
    const rawCountry = lsCountry || cacheCountry || urlCountry || null;
    let country = (rawCountry && rawCountry !== 'xx') ? rawCountry : null;

    // ── Basic info ──
    document.getElementById('playerSteamId').textContent = sid;
    document.getElementById('playerAvatar').src = avatar;
    document.getElementById('playerName').textContent = name;
    document.title = `KZ — ${name}`;

    const flagEl = document.getElementById('playerFlag');
    const statCountryEl = document.getElementById('statCountryDisplay');

    function applyCountry(c) {
      if (c && c !== 'xx') {
        if (flagEl) flagEl.innerHTML = countryToFlag(c);
        if (statCountryEl) statCountryEl.innerHTML =
          `<img src="https://flagcdn.com/w40/${c}.png" style="height:22px;border-radius:3px;vertical-align:middle"> ${c.toUpperCase()}`;
      } else {
        if (flagEl) flagEl.innerHTML = '';
        if (statCountryEl) statCountryEl.textContent = '—';
      }
    }

    applyCountry(country);

    // ── Always fetch latest country from Supabase (change-flag updates it instantly) ──
    fetch(
      `https://btcufotfvfnuoiokghjm.supabase.co/rest/v1/players?steamid=eq.${sid}&select=country&limit=1`,
      { headers: { apikey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0Y3Vmb3RmdmZudW9pb2tnaGptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwODEzMTcsImV4cCI6MjA5NjY1NzMxN30.hj_whZDtPhqfC-5ktGvLfqoMBp_x3G8w3lv5IcBdCX4', Authorization: `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0Y3Vmb3RmdmZudW9pb2tnaGptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwODEzMTcsImV4cCI6MjA5NjY1NzMxN30.hj_whZDtPhqfC-5ktGvLfqoMBp_x3G8w3lv5IcBdCX4` } }
    ).then(r => r.ok ? r.json() : null)
     .then(rows => {
       if (rows?.length && rows[0].country && rows[0].country !== 'xx') {
         applyCountry(rows[0].country);
         // Also update localStorage if this is own profile
         if (sid === localStorage.getItem('kz_steam_id')) {
           localStorage.setItem('kz_country', rows[0].country);
         }
       }
     }).catch(() => {});

    // If no country set, try Steam API (returns loccountrycode)
    if (!country) {
      fetch(`${API_BASE}/api/steam-user?steamid=${sid}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d?.country) applyCountry(d.country); })
        .catch(() => {});
    }

    // Steam social link
    const steamLink = document.getElementById('steamSocialLink');
    if (steamLink) steamLink.href = `https://steamcommunity.com/profiles/${sid}`;

    // Last seen
    const lastSeenEl = document.getElementById('profileLastSeen');
    if (lastSeenEl) {
      const seenKey = `kz_seen_${sid}`;
      const lastSeen = localStorage.getItem(seenKey);
      if (lastSeen) lastSeenEl.textContent = `Last active on site ${timeSince(new Date(Number(lastSeen)))} ago`;
      localStorage.setItem(seenKey, Date.now().toString());
    }

    // ── Banner: load from Supabase (visible to all) ──
    const banner = document.getElementById('profileBanner');
    const SB_URL_P  = 'https://btcufotfvfnuoiokghjm.supabase.co';
    const SB_ANON_P = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0Y3Vmb3RmdmZudW9pb2tnaGptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwODEzMTcsImV4cCI6MjA5NjY1NzMxN30.hj_whZDtPhqfC-5ktGvLfqoMBp_x3G8w3lv5IcBdCX4';
    const SB_HDR_P  = { apikey: SB_ANON_P, Authorization: `Bearer ${SB_ANON_P}` };

    function applyBanner(url) {
      if (!banner) return;
      if (url) {
        banner.style.backgroundImage = `url(${url})`;
        localStorage.setItem(`kz_banner_${sid}`, url);
      } else {
        banner.style.removeProperty('background-image'); // Let CSS default show
        localStorage.removeItem(`kz_banner_${sid}`);
      }
    }

    if (banner) {
      // 1. Show localStorage instantly (no flicker)
      const cached = localStorage.getItem(`kz_banner_${sid}`);
      if (cached) applyBanner(cached);

      // 2. Fetch from Supabase (source of truth for all viewers)
      try {
        const sbRes = await fetch(
          `${SB_URL_P}/rest/v1/player_profiles?steamid=eq.${sid}&select=banner_url`,
          { headers: SB_HDR_P }
        );
        const rows = await sbRes.json();
        const sbBanner = Array.isArray(rows) ? rows?.[0]?.banner_url : null;
        applyBanner(sbBanner || null);
      } catch {}

      // 3. Real-time: instantly update banner for ALL viewers when owner changes it
      if (window.sbClient) {
        window.sbClient.channel(`profile_banner_${sid}`)
          .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'player_profiles',
          }, payload => {
            if (payload.new?.steamid !== sid) return;
            applyBanner(payload.new?.banner_url || null);
          })
          .subscribe();
      }
    }

    // ── Cybershoke link ──
    const cybLink = document.getElementById('cybershokeLink');
    if (cybLink) cybLink.href = `https://cybershoke.net/ru/cs2/leaderboard/kz/maps/${sid}`;

    // ── Stats bar ──
    const worldRank = data.kz_place ? `#${Number(data.kz_place).toLocaleString()}` : (desc['{{Position}}'] ?? kzUser.place ?? '—');
    setStatIfExists('statWorldRank', worldRank);

    const kzPoints = data.kz_points ? Number(data.kz_points).toFixed(0) : (desc['{{Points}}'] ?? kzUser.points ?? '—');
    setStatIfExists('statPoints', kzPoints);

    const mapsCount = data.kz_maps || data.maps?.list?.length || desc['{{COMPLETIONS-MAP}}'] || '—';
    setStatIfExists('statMaps', mapsCount);

    // Faceit ELO — fetch async
    setStatIfExists('statFaceitElo', '…');
    fetch(`${API_BASE}/api/faceit?action=stats&steamid=${sid}`)
      .then(r => r.ok ? r.json() : null)
      .then(f => {
        if (f?.elo) {
          setStatIfExists('statFaceitElo', f.elo.toLocaleString());
          const faceitLink = document.getElementById('faceitSocialLink');
          if (faceitLink && f.faceit_url) {
            faceitLink.href = f.faceit_url;
            faceitLink.classList.remove('hidden');
          }
        } else {
          setStatIfExists('statFaceitElo', 'No profile');
        }
      }).catch(() => setStatIfExists('statFaceitElo', 'No profile'));

    // ── Maps table ──
    const mapList = (data.maps?.list || []).sort((a, b) => Number(a.tier) - Number(b.tier));
    renderMaps(mapList);

    // ── Cached note ──
    if (data.cached_at) {
      const el = document.getElementById('cachedAt');
      if (el) el.textContent = `Stats cached ${timeSince(new Date(data.cached_at))} ago`;
    }

    loadingState.classList.add('hidden');
    profileContent.classList.remove('hidden');

    // Init Steam UI after content is visible
    initSteamUI();

  } catch (e) {
    showError('Failed to load profile. ' + e.message);
  }
}

function setStatIfExists(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

// Global map totals — loaded once, used to show correct totals for all players
let _mapTotals = {};
async function loadMapTotals() {
  try {
    const r = await fetch(`${CACHE_BASE}/map-totals.json?bust=${Date.now()}`);
    if (r.ok) _mapTotals = await r.json();
  } catch {}
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
    let pos = (row.place_num ?? '—').replace(/Â | /g, ' ');
    if (_mapTotals[mapName] && pos !== '—') {
      const parts = pos.split('/');
      if (parts.length === 2) {
        const rank = parts[0].trim();
        const total = String(_mapTotals[mapName]).replace(/B(?=(d{3})+(?!d))/g, ' ');
        pos = rank + ' / ' + total;
      }
    }
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
  // Check Supabase player_cache first — available immediately after scrape
  try {
    const sbRes = await fetch(
      `${SB_URL}/rest/v1/player_cache?steamid=eq.${sid}&select=steamid&limit=1`,
      { headers: { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}` } }
    );
    if (sbRes.ok) {
      const rows = await sbRes.json();
      if (rows.length) {
        stopProgress();
        await new Promise(r => setTimeout(r, 600));
        loadProfile(sid);
        return;
      }
    }
  } catch {}
  // Fall back to GitHub raw CDN check
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


function getStoredToken() {
  const auth = typeof getAuth === 'function' ? getAuth() : null;
  return auth ? auth.token : null;
}

// ── Save banner to Supabase with visible feedback ──
async function saveBannerToSupabase(token, bannerUrl) {
  // Show saving indicator
  const editBtn = document.getElementById('bannerEditBtn');
  const removeBtn = document.getElementById('bannerRemoveBtn');
  const origEditText = editBtn ? editBtn.textContent : '';
  if (editBtn) { editBtn.textContent = '⏳ Saving…'; editBtn.disabled = true; }
  if (removeBtn) removeBtn.disabled = true;

  try {
    const res = await fetch('https://kzlb.vercel.app/api/friend-action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, action: 'set-banner', banner_url: bannerUrl }),
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      if (editBtn) { editBtn.textContent = '✅ Saved!'; }
      setTimeout(() => { if (editBtn) { editBtn.textContent = origEditText; editBtn.disabled = false; } if (removeBtn) removeBtn.disabled = false; }, 1500);
    } else {
      alert('Banner save failed: ' + (data.error || res.status + ' - check Vercel logs'));
      if (editBtn) { editBtn.textContent = origEditText; editBtn.disabled = false; }
      if (removeBtn) removeBtn.disabled = false;
    }
  } catch (e) {
    alert('Banner save failed (network error): ' + e.message);
    if (editBtn) { editBtn.textContent = origEditText; editBtn.disabled = false; }
    if (removeBtn) removeBtn.disabled = false;
  }
}

// ── Banner edit (owner only) ──
function initBannerUI(ownerSteamId) {
  const controls   = document.getElementById('bannerOwnerControls');
  const editBtn    = document.getElementById('bannerEditBtn');
  const removeBtn  = document.getElementById('bannerRemoveBtn');
  const fileInput  = document.getElementById('bannerFileInput');
  const dropHint   = document.getElementById('bannerDropHint');
  const banner     = document.getElementById('profileBanner');
  if (!controls || ownerSteamId !== steamid) return;

  controls.classList.remove('hidden');
  if (localStorage.getItem(`kz_banner_${steamid}`)) removeBtn.classList.remove('hidden');

  function applyImage(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      // Compress via canvas
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxW = 1920, maxH = 1080;
        let w = img.width, h = img.height;
        if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
        if (h > maxH) { w = Math.round(w * maxH / h); h = maxH; }
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
        if (dataUrl.length > 2000000) { alert('Image too large. Try a smaller file.'); return; }
        localStorage.setItem(`kz_banner_${steamid}`, dataUrl);
        banner.style.backgroundImage = `url(${dataUrl})`;
        removeBtn.classList.remove('hidden');
        // Save to Supabase so others can see it
        const auth = typeof getAuth === 'function' ? getAuth() : null;
        if (auth?.token) {
          saveBannerToSupabase(auth.token, dataUrl);
        }

      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  // Click to open file picker
  editBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => applyImage(fileInput.files[0]));

  // Remove banner
  removeBtn.addEventListener('click', () => {
    localStorage.removeItem(`kz_banner_${steamid}`);
    banner.style.backgroundImage = '';
    removeBtn.classList.add('hidden');
    const auth = typeof getAuth === 'function' ? getAuth() : null;
    if (auth?.token) {
      saveBannerToSupabase(auth.token, '');
    }
  });

  // Drag & drop onto the banner
  banner.addEventListener('dragover', (e) => {
    e.preventDefault();
    banner.classList.add('drag-over');
    if (dropHint) dropHint.classList.remove('hidden');
  });
  banner.addEventListener('dragleave', () => {
    banner.classList.remove('drag-over');
    if (dropHint) dropHint.classList.add('hidden');
  });
  banner.addEventListener('drop', (e) => {
    e.preventDefault();
    banner.classList.remove('drag-over');
    if (dropHint) dropHint.classList.add('hidden');
    const file = e.dataTransfer.files[0];
    applyImage(file);
  });
}

// ── Steam UI (flag change, logout, login prompt) ──
function initSteamUI() {
  const auth = typeof getAuth === 'function' ? getAuth() : null;
  const token = auth ? auth.token : null;
  const loggedInSteamId = auth ? auth.steamid : null;
  const ownProfileActions  = document.getElementById('ownProfileActions');
  const steamLoginBtn      = document.getElementById('steamLoginBtn');
  const steamLogoutBtn     = document.getElementById('steamLogoutBtn');
  const flagChangeBtn      = document.getElementById('flagChangeBtn');
  const flagChangeStatus   = document.getElementById('flagChangeStatus');
  const flagDropdown       = document.getElementById('flagDropdown');
  const flagDropdownTrigger= document.getElementById('flagDropdownTrigger');
  const flagDropdownLabel  = document.getElementById('flagDropdownLabel');
  const flagDropdownPanel  = document.getElementById('flagDropdownPanel');
  const flagSearchInput    = document.getElementById('flagSearchInput');
  const flagOptionsList    = document.getElementById('flagOptionsList');

  if (!ownProfileActions || !steamLoginBtn) return;

  // ── Build custom flag dropdown ──
  let selectedFlagCode = 'xx';

  function buildFlagOptions(filter = '') {
    if (!flagOptionsList) return;
    const q = filter.toLowerCase();
    flagOptionsList.innerHTML = '';
    ALL_COUNTRIES_PROFILE
      .filter(c => !q || c.name.toLowerCase().includes(q) || c.code.includes(q))
      .forEach(c => {
        const div = document.createElement('div');
        div.className = 'flag-option' + (c.code === selectedFlagCode ? ' selected' : '');
        div.dataset.code = c.code;
        const flagImg = c.code !== 'xx'
          ? `<img src="https://flagcdn.com/w20/${c.code}.png" style="height:14px;border-radius:2px;flex-shrink:0">`
          : `<span style="opacity:0.4;font-size:0.9em">🏳️</span>`;
        div.innerHTML = `${flagImg}<span>${c.name}</span>`;
        div.addEventListener('click', () => {
          selectedFlagCode = c.code;
          const flagImgLabel = c.code !== 'xx'
            ? `<img src="https://flagcdn.com/w20/${c.code}.png" style="height:14px;border-radius:2px;vertical-align:middle;margin-right:4px">${c.name}`
            : c.name;
          if (flagDropdownLabel) flagDropdownLabel.innerHTML = flagImgLabel;
          flagDropdownPanel.classList.add('hidden');
          flagOptionsList.querySelectorAll('.flag-option').forEach(el => el.classList.remove('selected'));
          div.classList.add('selected');
        });
        flagOptionsList.appendChild(div);
      });
  }

  if (flagDropdownTrigger && !flagDropdownTrigger._bound) {
    flagDropdownTrigger._bound = true;
    buildFlagOptions();
    flagDropdownTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      flagDropdownPanel.classList.toggle('hidden');
      if (!flagDropdownPanel.classList.contains('hidden')) {
        flagSearchInput?.focus();
      }
    });
    flagSearchInput?.addEventListener('input', () => buildFlagOptions(flagSearchInput.value));
    document.addEventListener('click', () => flagDropdownPanel?.classList.add('hidden'));
    flagDropdownPanel?.addEventListener('click', e => e.stopPropagation());
  }

  if (token && loggedInSteamId && loggedInSteamId === steamid) {
    ownProfileActions.classList.remove('hidden');
    steamLoginBtn.classList.add('hidden');
    initBannerUI(loggedInSteamId);
    // Init notifications for the logged-in user (works on any profile page)
    const authObj = typeof getAuth === 'function' ? getAuth() : null;
    if (authObj) initNotifications(authObj);
  } else if (token && loggedInSteamId && loggedInSteamId !== steamid) {
    // Viewing someone else's profile while logged in — still show bell
    steamLoginBtn.classList.add('hidden');
    const authObj = typeof getAuth === 'function' ? getAuth() : null;
    if (authObj) initNotifications(authObj);
  } else if (!token) {
    steamLoginBtn.classList.remove('hidden');
    ownProfileActions.classList.add('hidden');
  }

  if (steamLogoutBtn && !steamLogoutBtn._bound) {
    steamLogoutBtn._bound = true;
    steamLogoutBtn.addEventListener('click', () => {
      if (typeof clearAuth === 'function') clearAuth();
      ownProfileActions.classList.add('hidden');
      steamLoginBtn.classList.remove('hidden');
    });
  }

  if (flagChangeBtn && !flagChangeBtn._bound) {
    flagChangeBtn._bound = true;
    flagChangeBtn.addEventListener('click', async () => {
      const country = selectedFlagCode;
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
          flagChangeStatus.textContent = '✅ Flag updated!';
          flagChangeStatus.className = 'flag-change-status success';

          // ── Store country in localStorage so leaderboards show glow immediately ──
          if (country && country !== 'xx') localStorage.setItem('kz_country', country);
          else localStorage.removeItem('kz_country');

          // ── Update URL param so refresh also shows correct flag ──
          const url = new URL(window.location.href);
          if (country === 'xx') url.searchParams.delete('country');
          else url.searchParams.set('country', country);
          history.replaceState(null, '', url.toString());

          // ── Redirect to country leaderboard after a short delay ──
          if (country && country !== 'xx') {
            flagChangeStatus.textContent = '✅ Flag updated! Redirecting…';
            setTimeout(() => {
              window.location.href = country === 'pt' ? 'portugal.html' : `${country}.html`;
            }, 1200);
          } else {
            // No flag — just update the UI in place
            const flagEl = document.getElementById('playerFlag');
            const countryEl = document.getElementById('statCountryDisplay');
            if (flagEl) flagEl.innerHTML = '';
            if (countryEl) countryEl.innerHTML = '—';
          }
        } else {
          flagChangeStatus.textContent = '✗ ' + (data.error || 'Failed');
          flagChangeStatus.className = 'flag-change-status error';
          if (r.status === 401 && typeof clearAuth === 'function') {
            clearAuth();
            ownProfileActions.classList.add('hidden');
            steamLoginBtn.classList.remove('hidden');
          }
        }
      } catch {
        flagChangeStatus.textContent = '✗ Network error';
        flagChangeStatus.className = 'flag-change-status error';
      }
      flagChangeBtn.disabled = false;
    });
  }
}

// ── Profile Tabs ──
function initTabs() {
  const tabs      = document.querySelectorAll('.profile-tab');
  const indicator = document.querySelector('.profile-tab-indicator');
  const panels    = { profile: document.getElementById('tab-profile'), friends: document.getElementById('tab-friends') };

  function moveIndicator(activeTab) {
    if (!indicator) return;
    indicator.style.width     = activeTab.offsetWidth + 'px';
    indicator.style.transform = `translateX(${activeTab.offsetLeft}px)`;
  }

  function switchTab(name, pushState = true) {
    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    Object.entries(panels).forEach(([k, el]) => { if (el) el.classList.toggle('hidden', k !== name); });
    const activeTab = [...tabs].find(t => t.dataset.tab === name);
    if (activeTab) moveIndicator(activeTab);

    if (pushState) {
      const url = new URL(window.location.href);
      if (name === 'profile') url.searchParams.delete('tab');
      else url.searchParams.set('tab', name);
      history.pushState({ tab: name }, '', url.toString());
    }
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // Handle browser back/forward
  window.addEventListener('popstate', (e) => {
    const tab = e.state?.tab || new URLSearchParams(window.location.search).get('tab') || 'profile';
    switchTab(tab, false);
  });

  // Init from URL on load
  const initTab = new URLSearchParams(window.location.search).get('tab') || 'profile';
  // Wait for layout so indicator width is correct
  requestAnimationFrame(() => switchTab(initTab, false));
}

// Run tabs after DOM is ready
document.addEventListener('DOMContentLoaded', initTabs);

// ── NOTIFICATIONS ──────────────────────────────────────────────
const SB_NOTIF_URL  = 'https://btcufotfvfnuoiokghjm.supabase.co';
const SB_NOTIF_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0Y3Vmb3RmdmZudW9pb2tnaGptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwODEzMTcsImV4cCI6MjA5NjY1NzMxN30.hj_whZDtPhqfC-5ktGvLfqoMBp_x3G8w3lv5IcBdCX4';

function timeSinceNotif(dateStr) {
  const s = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s/60)}m ago`;
  if (s < 86400)return `${Math.floor(s/3600)}h ago`;
  return `${Math.floor(s/86400)}d ago`;
}

function renderNotifications(items) {
  const list  = document.getElementById('notifList');
  const badge = document.getElementById('notifBadge');
  if (!list) return;

  const unread = items.filter(n => !n.read).length;
  if (unread > 0) {
    badge.textContent = unread > 9 ? '9+' : unread;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }

  if (!items.length) {
    list.innerHTML = '<div class="notif-empty">No notifications yet</div>';
    return;
  }

  list.innerHTML = items.map(n => {
    const msg = n.type === 'friend_accepted'
      ? `<strong>${n.from_nickname || 'Someone'}</strong> accepted your friend request and has been added to your friends list`
      : n.type;
    return `
      <div class="notif-item ${n.read ? '' : 'unread'}">
        <img class="notif-avatar" src="${n.from_avatar || ''}" onerror="this.src='https://steamcdn-a.akamaihd.net/steamcommunity/public/images/avatars/fe/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_medium.jpg'">
        <div style="flex:1">
          <div class="notif-text">${msg}</div>
          <div class="notif-time">${timeSinceNotif(n.created_at)}</div>
        </div>
      </div>`;
  }).join('');
}

async function loadNotifications(steamid, token) {
  try {
    const res = await fetch('https://kzlb.vercel.app/api/friend-action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, action: 'get-notifications' }),
    });
    const data = await res.json();
    console.log('[notif] status:', res.status, 'data:', JSON.stringify(data));
    if (res.ok && data.notifications) renderNotifications(data.notifications);
  } catch (e) {
    console.error('[notif] fetch error:', e);
  }
}

function initNotifications(auth) {
  const wrap = document.getElementById('notifBellWrap');
  const btn  = document.getElementById('notifBellBtn');
  const drop = document.getElementById('notifDropdown');
  if (!wrap || !btn || !drop) return;

  wrap.style.display = 'block';

  // Initial load
  loadNotifications(auth.steamid, auth.token);

  // Real-time: new notification → refresh
  if (window.sbClient) {
    window.sbClient
      .channel(`notif_${auth.steamid}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `steamid=eq.${auth.steamid}`,
      }, () => loadNotifications(auth.steamid, auth.token))
      .subscribe();
  }

  // Toggle dropdown
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const isOpen = !drop.classList.contains('hidden');
    drop.classList.toggle('hidden');
    if (!isOpen) {
      // Mark all as read
      const token = auth.token;
      if (token) {
        fetch('https://kzlb.vercel.app/api/friend-action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, action: 'notifications-read' }),
        }).catch(() => {});
        // Optimistically clear badge
        document.getElementById('notifBadge')?.classList.add('hidden');
        // Re-render as all read
        setTimeout(() => loadNotifications(auth.steamid, auth.token), 500);
      }
    }
  });

  // Close on outside click
  document.addEventListener('click', () => drop.classList.add('hidden'));
  drop.addEventListener('click', e => e.stopPropagation());
}

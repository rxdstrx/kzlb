const CACHE_BASE = 'https://raw.githubusercontent.com/rxdstrx/kzlb/main/cache';
const TRIGGER_URL = 'https://raspy-river-8e9e.dmitriyrodniy.workers.dev/trigger';

const params = new URLSearchParams(window.location.search);
const steamid = params.get('steamid');

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
      // No cache yet — trigger scrape and tell user to wait
      triggerScrape(sid);
      showError('Stats not cached yet. Please wait ~2 minutes and refresh the page — we are fetching your data now.');
      return;
    }

    const data = await cacheRes.json();

    // Player info from maps.header or user mode 18
    const header = data.maps?.header || {};
    const kzUser = data.user?.['18'] || {};
    const name   = header.title || kzUser.name || 'Unknown Player';
    const avatar = header.avatar || kzUser.avatar || '';
    const desc   = header.desc || {};

    document.getElementById('playerName').textContent    = name;
    document.getElementById('playerSteamId').textContent = sid;
    document.getElementById('playerAvatar').src          = avatar;
    document.title = `KZ — ${name}`;

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
    const date    = row.unixtime_record
      ? new Date(row.unixtime_record * 1000).toLocaleDateString('ru-RU', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })
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
      <td><span class="pts-cell">${pts}</span></td>
      <td><span class="date-cell">${date}</span></td>
    `;
    statsBody.appendChild(tr);
  });
}

async function triggerScrape(sid) {
  try {
    await fetch(`https://api.github.com/repos/rxdstrx/kzlb/actions/workflows/scrape-kz.yml/dispatches`, {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main', inputs: { steamid: sid } }),
    });
  } catch {}
}

function timeSince(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

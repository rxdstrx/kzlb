const CORS = 'https://api.allorigins.win/raw?url=';
const params = new URLSearchParams(window.location.search);
const steamid = params.get('steamid');

const loadingState  = document.getElementById('loadingState');
const errorState    = document.getElementById('errorState');
const profileContent= document.getElementById('profileContent');
const errorMsg      = document.getElementById('errorMsg');

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
    // Fetch Steam profile via XML endpoint
    const xmlUrl = `https://steamcommunity.com/profiles/${sid}/?xml=1`;
    const res = await fetch(CORS + encodeURIComponent(xmlUrl));
    const text = await res.text();
    const parser = new DOMParser();
    const xml = parser.parseFromString(text, 'text/xml');

    const name   = xml.querySelector('steamID')?.textContent   || 'Unknown Player';
    const avatar = xml.querySelector('avatarFull')?.textContent || '';

    document.getElementById('playerName').textContent   = name;
    document.getElementById('playerSteamId').textContent = sid;
    document.getElementById('playerAvatar').src          = avatar;
    document.title = `KZ — ${name}`;

    const csLink = `https://cybershoke.net/ru/cs2/leaderboard/kz/maps/${sid}`;
    document.getElementById('cybershokeLink').href = csLink;

    // Fetch Cybershoke stats
    await loadCybershokeStats(sid);

    loadingState.classList.add('hidden');
    profileContent.classList.remove('hidden');

  } catch (e) {
    showError('Failed to load Steam profile. Check the Steam ID and try again.');
  }
}

async function loadCybershokeStats(sid) {
  const statsBody = document.getElementById('statsBody');
  const noStats   = document.getElementById('noStats');

  try {
    const apiUrl = `https://cybershoke.net/api/kz/leaderboard/maps/${sid}`;
    const res = await fetch(CORS + encodeURIComponent(apiUrl));
    const data = await res.json();

    const rows = Array.isArray(data) ? data : (data.data || data.maps || data.results || []);

    if (!rows.length) {
      noStats.classList.remove('hidden');
      return;
    }

    // Build a map lookup for thumbnails and tier
    const mapLookup = {};
    ALL_MAPS.forEach(m => { mapLookup[m.name] = m; });

    rows.forEach(row => {
      const mapName = row.map || row.mapName || row.map_name || '—';
      const mapInfo = mapLookup[mapName] || {};
      const tier    = row.tier ?? mapInfo.tier ?? '—';
      const runs    = row.completions ?? row.runs ?? row.count ?? '—';
      const time    = row.time ?? row.best_time ?? '—';
      const pos     = row.position != null ? `${row.position} / ${row.total ?? '?'}` : '—';
      const pts     = row.points != null ? Number(row.points).toFixed(4) : '—';
      const date    = row.date ? row.date.slice(0, 10) : '—';

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

  } catch {
    // API failed — show a message with the direct link
    noStats.textContent = 'Could not load stats automatically.';
    noStats.classList.remove('hidden');
  }
}

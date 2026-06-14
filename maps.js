const CDN_BASE = 'https://cdn.jsdelivr.net/gh/rxdstrx/kzlb@main/cache';
const SB_URL  = 'https://btcufotfvfnuoiokghjm.supabase.co';
const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0Y3Vmb3RmdmZudW9pb2tnaGptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwODEzMTcsImV4cCI6MjA5NjY1NzMxN30.hj_whZDtPhqfC-5ktGvLfqoMBp_x3G8w3lv5IcBdCX4';
const SB_HDR  = { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}` };

function secToTime(s) {
  if (!isFinite(s) || s < 0) return '—';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = (s % 60).toFixed(4).padStart(7, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

async function fetchMyMaps(steamid) {
  const PAGE = 1000;
  let offset = 0, rows = [];
  while (true) {
    const r = await fetch(
      `${SB_URL}/rest/v1/player_maps?steamid=eq.${steamid}&select=map,time_record&limit=${PAGE}&offset=${offset}`,
      { headers: SB_HDR }
    );
    if (!r.ok) break;
    const batch = await r.json();
    rows = rows.concat(batch);
    if (batch.length < PAGE) break;
    offset += PAGE;
  }
  return rows;
}

async function init() {
  const mapsLoading   = document.getElementById('mapsLoading');
  const mapsTableWrap = document.getElementById('mapsTableWrap');
  const mapsBody      = document.getElementById('maps-body');
  const loggedSteamid = localStorage.getItem('kz_steam_id');

  try {
    const requests = [
      fetch(`${CDN_BASE}/map-stats.json`).then(r => { if (!r.ok) throw new Error('map-stats fetch failed'); return r.json(); }),
    ];
    if (loggedSteamid) requests.push(fetchMyMaps(loggedSteamid));

    const [statsData, myRows = []] = await Promise.all(requests);

    const mapStats = statsData.maps || {};
    const myMap    = new Map(myRows.map(r => [r.map, r.time_record]));

    mapsBody.innerHTML = '';
    ALL_MAPS.forEach((map, index) => {
      const i   = index + 1;
      const rnk = i === 1 ? 'top1' : i === 2 ? 'top2' : i === 3 ? 'top3' : '';
      const s   = mapStats[map.name] || {};
      const completions = s.completions ? s.completions.toLocaleString() : '—';
      const record      = s.record || '—';
      const yourTime    = myMap.get(map.name) || '—';
      const avgSec      = s.avg;

      const tr = document.createElement('tr');
      tr.style.cursor = 'pointer';
      tr.innerHTML = `
        <td><span class="rank ${rnk}">${i}</span></td>
        <td>
          <div class="map-name-cell">
            ${map.img ? `<img class="map-thumb" src="${map.img}" alt="${map.name}">` : '<div class="map-thumb map-thumb-empty"></div>'}
            <span class="mapname-cell">${map.name}</span>
          </div>
        </td>
        <td><span class="tier-badge tier-${map.tier}">${map.tier}</span></td>
        <td class="maps-stat-cell">${completions}</td>
        <td class="maps-stat-cell maps-record-cell">${record}</td>
        <td class="maps-stat-cell ${yourTime !== '—' ? 'maps-yourtime-cell' : 'maps-dash-cell'}">${yourTime}</td>
        <td class="maps-stat-cell maps-avg-cell">${avgSec !== null && avgSec !== undefined ? secToTime(avgSec) : '—'}</td>
      `;
      tr.addEventListener('click', () => {
        window.location.href = `map.html?map=${encodeURIComponent(map.name)}`;
      });
      mapsBody.appendChild(tr);
    });

    mapsLoading.style.display = 'none';
    mapsTableWrap.classList.remove('hidden');
  } catch (e) {
    mapsLoading.style.display = 'none';
    mapsLoading.querySelector('p').textContent = 'Failed to load map stats.';
  }
}

init();

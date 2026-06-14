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

async function fetchAll(url) {
  const PAGE = 1000;
  let offset = 0, rows = [];
  while (true) {
    const sep = url.includes('?') ? '&' : '?';
    const r = await fetch(`${url}${sep}limit=${PAGE}&offset=${offset}`, { headers: SB_HDR });
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
    // Aggregated per-map stats are computed server-side by the `map_stats_live`
    // view (one row per map) instead of pulling every player_maps row to the
    // browser. Same numbers, ~6 kB instead of ~300 kB+, and still fully live.
    const requests = [
      fetch(`${SB_URL}/rest/v1/map_stats_live?select=map,completions,record,avg_sec`, { headers: SB_HDR })
        .then(r => r.ok ? r.json() : []),
    ];
    // "Your time" stays a per-player lookup — only the logged-in user's own rows.
    if (loggedSteamid) {
      requests.push(
        fetchAll(`${SB_URL}/rest/v1/player_maps?steamid=eq.${loggedSteamid}&select=map,time_record`)
      );
    }
    const [statRows, myRows = []] = await Promise.all(requests);

    const myMap = new Map(myRows.map(r => [r.map, r.time_record]));

    const mapStats = new Map();
    for (const r of statRows) {
      if (!r.map) continue;
      const avg = (r.avg_sec === null || r.avg_sec === undefined) ? null : Number(r.avg_sec);
      mapStats.set(r.map, {
        completions: Number(r.completions) || 0,
        record:      r.record || null,
        avgSec:      (avg !== null && isFinite(avg)) ? avg : null,
      });
    }

    // Render rows
    mapsBody.innerHTML = '';
    ALL_MAPS.forEach((map, index) => {
      const i   = index + 1;
      const rnk = i === 1 ? 'top1' : i === 2 ? 'top2' : i === 3 ? 'top3' : '';
      const s   = mapStats.get(map.name) || {};
      const completions = s.completions ? s.completions.toLocaleString() : '—';
      const record      = s.record || '—';
      const yourTime    = myMap.get(map.name) || '—';
      const avgSec      = (s.avgSec !== null && s.avgSec !== undefined) ? s.avgSec : null;

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
        <td class="maps-stat-cell maps-avg-cell">${avgSec !== null ? secToTime(avgSec) : '—'}</td>
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

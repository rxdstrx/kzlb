const SB_URL  = 'https://btcufotfvfnuoiokghjm.supabase.co';
const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0Y3Vmb3RmdmZudW9pb2tnaGptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwODEzMTcsImV4cCI6MjA5NjY1NzMxN30.hj_whZDtPhqfC-5ktGvLfqoMBp_x3G8w3lv5IcBdCX4';
const SB_HDR  = { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}` };

function timeToSec(t) {
  if (!t || t === '—') return Infinity;
  t = t.trim();
  const p = t.split(':');
  try {
    if (p.length === 3) return Math.abs(parseInt(p[0])) * 3600 + parseInt(p[1]) * 60 + parseFloat(p[2]);
    if (p.length === 2) return parseInt(p[0]) * 60 + parseFloat(p[1]);
  } catch {}
  return parseFloat(t);
}

// Parse the denominator from "rank / total" format (handles non-breaking spaces)
function parsePlaceTotal(placeNum) {
  const clean = (placeNum || '').replace(/[\s ]/g, '');
  const m = clean.match(/^(\d+)\/(\d+)$/);
  return m ? parseInt(m[2], 10) : 0;
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
    // Fetch from three sources in parallel:
    // 1. map_stats — Supabase table with authoritative global completion counts per map.
    //    Written by bulk-update-all.py and add-player.js whenever any player is updated.
    //    Schema: { map TEXT PK, total_completions INT, updated_at TIMESTAMPTZ }
    // 2. player_maps — all player records (for fastest time + avg across our tracked players)
    // 3. logged-in player's own maps (for "Your time" column)
    const requests = [
      fetch(`${SB_URL}/rest/v1/map_stats?select=map,total_completions`, { headers: SB_HDR }).then(r => r.ok ? r.json() : []).catch(() => []),
      fetchAll(`${SB_URL}/rest/v1/player_maps?select=map,time_record,place_num`),
    ];
    if (loggedSteamid) {
      requests.push(
        fetchAll(`${SB_URL}/rest/v1/player_maps?steamid=eq.${loggedSteamid}&select=map,time_record`)
      );
    }
    const [mapStatsRows, allRows, myRows = []] = await Promise.all(requests);

    // Build per-map lookup for logged-in player
    const myMap = new Map(myRows.map(r => [r.map, r.time_record]));

    // Authoritative completion totals from map_stats table (populated once table exists)
    const dbTotals = new Map((mapStatsRows || []).map(r => [r.map, r.total_completions]));

    // Group all rows by map name — compute record, avg, and place_num max as fallback
    const mapStats = new Map(); // map_name → { record, times[], maxTotal }
    for (const row of allRows) {
      if (!row.map) continue;
      if (!mapStats.has(row.map)) mapStats.set(row.map, { record: null, times: [], maxTotal: 0 });
      const s = mapStats.get(row.map);

      const sec = timeToSec(row.time_record);
      if (isFinite(sec)) {
        s.times.push(sec);
        if (s.record === null || sec < timeToSec(s.record)) s.record = row.time_record;
      }

      // Keep place_num denominator as fallback if map_stats table is empty
      const tot = parsePlaceTotal(row.place_num);
      if (tot > s.maxTotal) s.maxTotal = tot;
    }

    // Render rows
    mapsBody.innerHTML = '';
    ALL_MAPS.forEach((map, index) => {
      const i   = index + 1;
      const rnk = i === 1 ? 'top1' : i === 2 ? 'top2' : i === 3 ? 'top3' : '';
      const s   = mapStats.get(map.name) || {};
      // Use map_stats table first; fall back to max place_num denominator across tracked players
      const total = dbTotals.get(map.name) || s.maxTotal || 0;
      const completions = total ? total.toLocaleString() : '—';
      const record      = s.record || '—';
      const yourTime    = myMap.get(map.name) || '—';
      const avgSec      = s.times?.length
        ? s.times.reduce((a, b) => a + b, 0) / s.times.length
        : null;

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
      `;
      tr.addEventListener('click', () => {
        window.location.href = `map.html?map=${encodeURIComponent(map.name)}`;
      });
      mapsBody.appendChild(tr);
    });

    mapsLoading.classList.add('hidden');
    mapsTableWrap.classList.remove('hidden');
  } catch (e) {
    mapsLoading.querySelector('p').textContent = 'Failed to load map stats.';
  }
}

init();

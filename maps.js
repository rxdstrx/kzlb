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
    const requests = [
      fetchAll(`${SB_URL}/rest/v1/player_maps?select=map,time_record,place_num`),
    ];
    if (loggedSteamid) {
      requests.push(
        fetchAll(`${SB_URL}/rest/v1/player_maps?steamid=eq.${loggedSteamid}&select=map,time_record`)
      );
    }
    const [allRows, myRows = []] = await Promise.all(requests);

    const myMap = new Map(myRows.map(r => [r.map, r.time_record]));

    // Use sum+count instead of times[] to avoid large array spread stack overflows
    const mapStats = new Map();
    for (const row of allRows) {
      if (!row.map) continue;
      if (!mapStats.has(row.map)) mapStats.set(row.map, { record: null, uniq: 0, timeSum: 0, timeCount: 0 });
      const s = mapStats.get(row.map);
      const sec = timeToSec(row.time_record);
      if (isFinite(sec)) {
        s.timeSum += sec;
        s.timeCount++;
        if (s.record === null || sec < timeToSec(s.record)) s.record = row.time_record;
      }
      const clean = (row.place_num || '').replace(/[\s ]/g, '');
      const pm = clean.match(/^(\d+)\/(\d+)$/);
      if (pm) { const tot = parseInt(pm[2], 10); if (tot > s.uniq) s.uniq = tot; }
    }

    // Render rows
    mapsBody.innerHTML = '';
    ALL_MAPS.forEach((map, index) => {
      const i   = index + 1;
      const rnk = i === 1 ? 'top1' : i === 2 ? 'top2' : i === 3 ? 'top3' : '';
      const s   = mapStats.get(map.name) || {};
      const completions = s.uniq ? s.uniq.toLocaleString() : '—';
      const record      = s.record || '—';
      const yourTime    = myMap.get(map.name) || '—';
      const avgSec      = s.timeCount > 0 ? s.timeSum / s.timeCount : null;

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

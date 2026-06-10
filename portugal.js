const CACHE_BASE = 'https://cdn.jsdelivr.net/gh/rxdstrx/kzlb@main/cache';
const PAGE_SIZE = 100;

let allPlayers = [];
let currentPage = 1;
let currentTab = 'overall';
let selectedMap = null;

const loadingState = document.getElementById('loadingState');
const tableWrapper = document.getElementById('tableWrapper');
const ptBody       = document.getElementById('ptBody');
const ptSub        = document.getElementById('ptSub');
const noData       = document.getElementById('noData');

// Convert time string to seconds for proper sorting
function timeToSeconds(t) {
  if (!t || t === '—') return Infinity;
  // Remove any spaces
  t = t.trim();
  const parts = t.split(':');
  try {
    if (parts.length === 3) {
      // HH:MM:SS.xxxx
      return Math.abs(parseInt(parts[0])) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2]);
    } else if (parts.length === 2) {
      // MM:SS.xxxx
      return parseInt(parts[0]) * 60 + parseFloat(parts[1]);
    }
  } catch { return Infinity; }
  return parseFloat(t);
}

async function init() {
  try {
    const res  = await fetch(`${CACHE_BASE}/pt-kz-players.json?bust=${Date.now()}`);
    const data = await res.json();
    allPlayers = data.players || [];

    ptSub.textContent = `${allPlayers.length} players with KZ data · Updated ${timeSince(new Date(data.updated_at))} ago`;
    loadingState.classList.add('hidden');
    tableWrapper.classList.remove('hidden');
    renderOverall();
    buildMapList();
  } catch (e) {
    loadingState.querySelector('p').textContent = 'Failed to load data.';
  }
}

function getOverallSorted() {
  return [...allPlayers].sort((a, b) => b.kz_points - a.kz_points);
}

function getMapSorted(mapName) {
  return allPlayers
    .map(p => {
      const entry = (p.maps_list || []).find(m => m.map === mapName);
      return entry ? { ...p, entry } : null;
    })
    .filter(Boolean)
    .sort((a, b) => timeToSeconds(a.entry.time_record) - timeToSeconds(b.entry.time_record));
}

function renderPagination(total) {
  const existing = document.getElementById('pagination');
  if (existing) existing.remove();

  const totalPages = Math.ceil(total / PAGE_SIZE);
  if (totalPages <= 1) return;

  const nav = document.createElement('div');
  nav.id = 'pagination';
  nav.className = 'pagination';

  const prev = document.createElement('button');
  prev.className = 'page-btn' + (currentPage === 1 ? ' disabled' : '');
  prev.textContent = '← Prev';
  prev.disabled = currentPage === 1;
  prev.addEventListener('click', () => { currentPage--; rerenderCurrent(); });

  const info = document.createElement('span');
  info.className = 'page-info';
  info.textContent = `Page ${currentPage} of ${totalPages}`;

  const next = document.createElement('button');
  next.className = 'page-btn' + (currentPage === totalPages ? ' disabled' : '');
  next.textContent = 'Next →';
  next.disabled = currentPage === totalPages;
  next.addEventListener('click', () => { currentPage++; rerenderCurrent(); });

  nav.appendChild(prev);
  nav.appendChild(info);
  nav.appendChild(next);
  tableWrapper.appendChild(nav);
}

function rerenderCurrent() {
  if (selectedMap) renderByMap(selectedMap);
  else renderOverall();
  window.scrollTo({ top: document.getElementById('tableWrapper').offsetTop - 20, behavior: 'smooth' });
}

function renderOverall() {
  ptBody.innerHTML = '';
  noData.classList.add('hidden');
  document.getElementById('thPoints').textContent = 'Points';
  document.getElementById('thPlace').textContent  = 'Global Rank';
  document.getElementById('thMaps').textContent   = 'Maps Done';

  const sorted = getOverallSorted();
  if (!sorted.length) { noData.classList.remove('hidden'); return; }

  const start = (currentPage - 1) * PAGE_SIZE;
  const page  = sorted.slice(start, start + PAGE_SIZE);

  page.forEach((p, i) => {
    const rank = start + i + 1;
    const rankClass = rank === 1 ? 'top1' : rank === 2 ? 'top2' : rank === 3 ? 'top3' : '';
    const tr = document.createElement('tr');
    tr.dataset.steamid = p.steamid;
    tr.innerHTML = `
      <td><span class="rank-badge ${rankClass}">${rank}</span></td>
      <td>
        <div class="player-cell">
          <img class="player-thumb" src="${p.avatar}" onerror="this.style.display='none'" />
          <a class="player-nick" href="profile.html?steamid=${p.steamid}&country=pt">${p.nickname}</a>
        </div>
      </td>
      <td><span class="pts-cell">${Number(p.kz_points).toFixed(0)}</span></td>
      <td><span class="pos-cell">${fmtPlace(p.kz_place)}</span></td>
      <td><span class="runs-cell">${fmtMaps(p.kz_maps, p.maps_list)}</span></td>
    `;
    ptBody.appendChild(tr);
  });

  renderPagination(sorted.length);
  renderPinnedSelf(sorted);
}

function renderPinnedSelf(sorted) {
  const existing = document.getElementById('pinned-self-row');
  if (existing) existing.remove();

  const auth = typeof getAuth === 'function' ? getAuth() : null;
  if (!auth) return;

  const idx = sorted.findIndex(p => p.steamid === auth.steamid);
  // Only pin on this country's leaderboard if the player actually belongs here
  if (idx === -1) return;

  const p = sorted[idx];
  const rank = idx + 1;
  const rankClass = rank === 1 ? 'top1' : rank === 2 ? 'top2' : rank === 3 ? 'top3' : '';

  const tr = document.createElement('tr');
  tr.id = 'pinned-self-row';
  tr.className = 'pinned-self-row';
  tr.innerHTML = `
    <td><span class="rank-badge ${rankClass}">${rank}</span></td>
    <td>
      <div class="player-cell">
        <img class="player-thumb" src="${p.avatar || auth.avatar || ''}" onerror="this.style.display='none'" />
        <a class="player-nick" href="profile.html?steamid=${p.steamid}&country=pt">${p.nickname}</a>
        <span class="pinned-self-badge">📍 You</span>
      </div>
    </td>
    <td><span class="pts-cell">${Number(p.kz_points).toFixed(0)}</span></td>
    <td><span class="pos-cell">${fmtPlace(p.kz_place)}</span></td>
    <td><span class="runs-cell">${fmtMaps(p.kz_maps, p.maps_list)}</span></td>
  `;
  ptBody.insertBefore(tr, ptBody.firstChild);
}

function renderByMap(mapName) {
  ptBody.innerHTML = '';
  noData.classList.add('hidden');
  document.getElementById('thPoints').textContent = 'Time';
  document.getElementById('thPlace').textContent  = 'Position';
  document.getElementById('thMaps').textContent   = 'Runs';

  const sorted = getMapSorted(mapName);

  if (!sorted.length) {
    noData.textContent = `No Portuguese players found for ${mapName}`;
    noData.classList.remove('hidden');
    return;
  }

  const start = (currentPage - 1) * PAGE_SIZE;
  const page  = sorted.slice(start, start + PAGE_SIZE);

  page.forEach((p, i) => {
    const rank = start + i + 1;
    const rankClass = rank === 1 ? 'top1' : rank === 2 ? 'top2' : rank === 3 ? 'top3' : '';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="rank-badge ${rankClass}">${rank}</span></td>
      <td>
        <div class="player-cell">
          <img class="player-thumb" src="${p.avatar}" onerror="this.style.display='none'" />
          <a class="player-nick" href="profile.html?steamid=${p.steamid}&country=pt">${p.nickname}</a>
        </div>
      </td>
      <td><span class="time-cell">${p.entry.time_record}</span></td>
      <td><span class="pos-cell">${(p.entry.place_num || '').replace(/\u00c2\u00a0|\u00a0/g, ' ')}</span></td>
      <td><span class="runs-cell">${p.entry.completions}</span></td>
    `;
    ptBody.appendChild(tr);
  });

  renderPagination(sorted.length);
  renderPinnedSelfByMap(sorted, mapName, 'pt');
}

function renderPinnedSelfByMap(sorted, mapName, cc) {
  const existing = document.getElementById('pinned-self-row');
  if (existing) existing.remove();

  const auth = typeof getAuth === 'function' ? getAuth() : null;
  if (!auth) return;

  const idx = sorted.findIndex(p => p.steamid === auth.steamid);
  const tr = document.createElement('tr');
  tr.id = 'pinned-self-row';
  tr.className = 'pinned-self-row';

  if (idx === -1) {
    // Player hasn't done this map
    tr.innerHTML = `
      <td><span class="rank-badge">—</span></td>
      <td><div class="player-cell">
        <img class="player-thumb" src="${auth.avatar || ''}" onerror="this.style.display='none'" />
        <a class="player-nick" href="profile.html?steamid=${auth.steamid}&country=${cc}">${auth.nickname || 'You'}</a>
        <span class="pinned-self-badge">📍 You</span>
      </div></td>
      <td><span class="time-cell">—</span></td>
      <td><span class="pos-cell">—</span></td>
      <td><span class="runs-cell">—</span></td>
    `;
  } else {
    const p = sorted[idx];
    const rank = idx + 1;
    const rankClass = rank === 1 ? 'top1' : rank === 2 ? 'top2' : rank === 3 ? 'top3' : '';
    tr.innerHTML = `
      <td><span class="rank-badge ${rankClass}">${rank}</span></td>
      <td><div class="player-cell">
        <img class="player-thumb" src="${p.avatar || auth.avatar || ''}" onerror="this.style.display='none'" />
        <a class="player-nick" href="profile.html?steamid=${p.steamid}&country=${cc}">${p.nickname}</a>
        <span class="pinned-self-badge">📍 You</span>
      </div></td>
      <td><span class="time-cell">${p.entry.time_record}</span></td>
      <td><span class="pos-cell">${(p.entry.place_num || '').replace(/\u00c2\u00a0|\u00a0/g, ' ')}</span></td>
      <td><span class="runs-cell">${p.entry.completions}</span></td>
    `;
  }
  ptBody.insertBefore(tr, ptBody.firstChild);
}

function buildMapList() {
  const ptMapList   = document.getElementById('ptMapList');
  const ptMapSearch = document.getElementById('ptMapSearch');

  // Build map → tier lookup from ALL_MAPS + from player data
  const mapTierLookup = {};
  if (typeof ALL_MAPS !== 'undefined') {
    ALL_MAPS.forEach(m => { mapTierLookup[m.name] = m.tier; });
  }
  // Also get tier from player map records
  allPlayers.forEach(p => (p.maps_list || []).forEach(m => {
    if (!mapTierLookup[m.map] && m.tier) mapTierLookup[m.map] = m.tier;
  }));

  // Use ALL_MAPS as the source so all tiers 1-9 appear
  const maps = typeof ALL_MAPS !== 'undefined'
    ? [...ALL_MAPS].sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name)).map(m => m.name)
    : [...new Set(allPlayers.flatMap(p => (p.maps_list || []).map(m => m.map)))].sort();

  function render(filter = '') {
    ptMapList.innerHTML = '';
    maps.filter(m => m.toLowerCase().includes(filter.toLowerCase())).forEach(m => {
      const tier = mapTierLookup[m] || '?';
      const chip = document.createElement('div');
      chip.className = 'pt-map-chip' + (selectedMap === m ? ' active' : '');
      chip.innerHTML = `<span class="chip-tier t${tier}">T${tier}</span> ${m}`;
      chip.addEventListener('click', () => {
        selectedMap = selectedMap === m ? null : m;
        currentPage = 1;
        render(ptMapSearch.value);
        if (selectedMap) renderByMap(selectedMap);
        else renderOverall();
      });
      ptMapList.appendChild(chip);
    });
  }

  ptMapSearch.addEventListener('input', () => render(ptMapSearch.value));
  render();
}

// Tabs
document.getElementById('tabOverall').addEventListener('click', () => {
  currentTab = 'overall';
  selectedMap = null;
  currentPage = 1;
  document.getElementById('tabOverall').classList.add('active');
  document.getElementById('tabMap').classList.remove('active');
  document.getElementById('mapSelector').classList.add('hidden');
  renderOverall();
});

document.getElementById('tabMap').addEventListener('click', () => {
  currentTab = 'map';
  document.getElementById('tabMap').classList.add('active');
  document.getElementById('tabOverall').classList.remove('active');
  document.getElementById('mapSelector').classList.remove('hidden');
});

function timeSince(date) {
  const s = Math.floor((new Date() - date) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s/60)}m`;
  if (s < 86400) return `${Math.floor(s/3600)}h`;
  return `${Math.floor(s/86400)}d`;
}

init();

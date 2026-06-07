const CACHE_BASE = 'https://raw.githubusercontent.com/rxdstrx/kzlb/main/cache';

let allPlayers = [];
let currentTab = 'overall';
let selectedMap = null;

const loadingState = document.getElementById('loadingState');
const tableWrapper = document.getElementById('tableWrapper');
const ptBody       = document.getElementById('ptBody');
const ptSub        = document.getElementById('ptSub');
const noData       = document.getElementById('noData');

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

function renderOverall() {
  ptBody.innerHTML = '';
  noData.classList.add('hidden');
  document.getElementById('thPoints').textContent = 'Points';
  document.getElementById('thPlace').textContent  = 'Global Rank';
  document.getElementById('thMaps').textContent   = 'Maps Done';

  const sorted = [...allPlayers].sort((a, b) => b.kz_points - a.kz_points);
  if (!sorted.length) { noData.classList.remove('hidden'); return; }

  sorted.forEach((p, i) => {
    const rank = i + 1;
    const rankClass = rank === 1 ? 'top1' : rank === 2 ? 'top2' : rank === 3 ? 'top3' : '';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="rank-badge ${rankClass}">${rank}</span></td>
      <td>
        <div class="player-cell">
          <img class="player-thumb" src="${p.avatar}" onerror="this.style.display='none'" />
          <a class="player-nick" href="profile.html?steamid=${p.steamid}">${p.nickname}</a>
        </div>
      </td>
      <td><span class="pts-cell">${Number(p.kz_points).toFixed(0)}</span></td>
      <td><span class="pos-cell">#${p.kz_place?.toLocaleString() || '—'}</span></td>
      <td><span class="runs-cell">${p.kz_maps || p.maps_list?.length || '—'}</span></td>
    `;
    ptBody.appendChild(tr);
  });
}

function renderByMap(mapName) {
  ptBody.innerHTML = '';
  noData.classList.add('hidden');
  document.getElementById('thPoints').textContent = 'Time';
  document.getElementById('thPlace').textContent  = 'Position';
  document.getElementById('thMaps').textContent   = 'Runs';

  const players = allPlayers
    .map(p => {
      const mapEntry = (p.maps_list || []).find(m => m.map === mapName);
      return mapEntry ? { ...p, mapEntry } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.mapEntry.time_record.localeCompare(b.mapEntry.time_record));

  if (!players.length) {
    noData.textContent = `No Portuguese players found for ${mapName}`;
    noData.classList.remove('hidden');
    return;
  }

  players.forEach((p, i) => {
    const rank = i + 1;
    const rankClass = rank === 1 ? 'top1' : rank === 2 ? 'top2' : rank === 3 ? 'top3' : '';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="rank-badge ${rankClass}">${rank}</span></td>
      <td>
        <div class="player-cell">
          <img class="player-thumb" src="${p.avatar}" onerror="this.style.display='none'" />
          <a class="player-nick" href="profile.html?steamid=${p.steamid}">${p.nickname}</a>
        </div>
      </td>
      <td><span class="time-cell">${p.mapEntry.time_record}</span></td>
      <td><span class="pos-cell">${p.mapEntry.place_num}</span></td>
      <td><span class="runs-cell">${p.mapEntry.completions}</span></td>
    `;
    ptBody.appendChild(tr);
  });
}

function buildMapList() {
  const ptMapList  = document.getElementById('ptMapList');
  const ptMapSearch = document.getElementById('ptMapSearch');

  // Collect all unique maps across all players
  const mapSet = new Set();
  allPlayers.forEach(p => (p.maps_list || []).forEach(m => mapSet.add(m.map)));
  const maps = [...mapSet].sort();

  function render(filter = '') {
    ptMapList.innerHTML = '';
    maps.filter(m => m.includes(filter)).forEach(m => {
      const chip = document.createElement('div');
      chip.className = 'pt-map-chip' + (selectedMap === m ? ' active' : '');
      chip.textContent = m;
      chip.addEventListener('click', () => {
        selectedMap = selectedMap === m ? null : m;
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

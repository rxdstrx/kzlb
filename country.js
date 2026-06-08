const CACHE_BASE = 'https://raw.githubusercontent.com/rxdstrx/kzlb/main/cache';
const PAGE_SIZE = 100;

const COUNTRY_INFO = {
  pt: { name: 'Portugal',        flag: '🇵🇹' },
  es: { name: 'Spain',           flag: '🇪🇸' },
  fr: { name: 'France',          flag: '🇫🇷' },
  de: { name: 'Germany',         flag: '🇩🇪' },
  br: { name: 'Brazil',          flag: '🇧🇷' },
  pl: { name: 'Poland',          flag: '🇵🇱' },
  tr: { name: 'Turkey',          flag: '🇹🇷' },
  ru: { name: 'Russia',          flag: '🇷🇺' },
  gb: { name: 'United Kingdom',  flag: '🇬🇧' },
  us: { name: 'United States',   flag: '🇺🇸' },
  se: { name: 'Sweden',          flag: '🇸🇪' },
  fi: { name: 'Finland',         flag: '🇫🇮' },
  dk: { name: 'Denmark',         flag: '🇩🇰' },
  no: { name: 'Norway',          flag: '🇳🇴' },
  nl: { name: 'Netherlands',     flag: '🇳🇱' },
  ua: { name: 'Ukraine',         flag: '🇺🇦' },
  cz: { name: 'Czech Republic',  flag: '🇨🇿' },
  sk: { name: 'Slovakia',        flag: '🇸🇰' },
  hu: { name: 'Hungary',         flag: '🇭🇺' },
  ro: { name: 'Romania',         flag: '🇷🇴' },
  bg: { name: 'Bulgaria',        flag: '🇧🇬' },
  hr: { name: 'Croatia',         flag: '🇭🇷' },
  rs: { name: 'Serbia',          flag: '🇷🇸' },
  kz: { name: 'Kazakhstan',      flag: '🇰🇿' },
  cn: { name: 'China',           flag: '🇨🇳' },
  au: { name: 'Australia',       flag: '🇦🇺' },
  ca: { name: 'Canada',          flag: '🇨🇦' },
  ar: { name: 'Argentina',       flag: '🇦🇷' },
  cl: { name: 'Chile',           flag: '🇨🇱' },
  mx: { name: 'Mexico',          flag: '🇲🇽' },
  xx: { name: 'Other',           flag: '🌍' },
};

const params = new URLSearchParams(location.search);
const countryCode = (params.get('code') || 'xx').toLowerCase();
const info = COUNTRY_INFO[countryCode] || { name: countryCode.toUpperCase(), flag: '🌍' };

document.title = `KZ — ${info.name} Leaderboard`;
document.getElementById('countryFlag').textContent = info.flag;
document.getElementById('countryName').textContent = info.name;
document.getElementById('loadingText').textContent = `Loading ${info.name} leaderboard…`;

let allPlayers = [];
let currentPage = 1;
let selectedMap = null;

const loadingState = document.getElementById('loadingState');
const tableWrapper = document.getElementById('tableWrapper');
const ptBody       = document.getElementById('ptBody');
const ptSub        = document.getElementById('ptSub');
const noData       = document.getElementById('noData');

function timeToSeconds(t) {
  if (!t || t === '—') return Infinity;
  t = t.trim();
  const parts = t.split(':');
  try {
    if (parts.length === 3) return Math.abs(parseInt(parts[0])) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2]);
    if (parts.length === 2) return parseInt(parts[0]) * 60 + parseFloat(parts[1]);
  } catch { return Infinity; }
  return parseFloat(t);
}

async function init() {
  try {
    const res = await fetch(`${CACHE_BASE}/${countryCode}-kz-players.json?bust=${Date.now()}`);
    if (!res.ok) throw new Error('No data');
    const data = await res.json();
    allPlayers = data.players || [];

    ptSub.textContent = `${allPlayers.length} players with KZ data · Updated ${timeSince(new Date(data.updated_at))} ago`;
    loadingState.classList.add('hidden');
    tableWrapper.classList.remove('hidden');
    renderOverall();
    buildMapList();
  } catch {
    loadingState.querySelector('p').textContent = `No leaderboard data found for ${info.name} yet.`;
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

  const inf = document.createElement('span');
  inf.className = 'page-info';
  inf.textContent = `Page ${currentPage} of ${totalPages}`;

  const next = document.createElement('button');
  next.className = 'page-btn' + (currentPage === totalPages ? ' disabled' : '');
  next.textContent = 'Next →';
  next.disabled = currentPage === totalPages;
  next.addEventListener('click', () => { currentPage++; rerenderCurrent(); });

  nav.appendChild(prev);
  nav.appendChild(inf);
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

  renderPagination(sorted.length);
}

function renderByMap(mapName) {
  ptBody.innerHTML = '';
  noData.classList.add('hidden');
  document.getElementById('thPoints').textContent = 'Time';
  document.getElementById('thPlace').textContent  = 'Position';
  document.getElementById('thMaps').textContent   = 'Runs';

  const sorted = getMapSorted(mapName);
  if (!sorted.length) {
    noData.textContent = `No ${info.name} players found for ${mapName}`;
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
          <a class="player-nick" href="profile.html?steamid=${p.steamid}">${p.nickname}</a>
        </div>
      </td>
      <td><span class="time-cell">${p.entry.time_record}</span></td>
      <td><span class="pos-cell">${p.entry.place_num}</span></td>
      <td><span class="runs-cell">${p.entry.completions}</span></td>
    `;
    ptBody.appendChild(tr);
  });

  renderPagination(sorted.length);
}

function buildMapList() {
  const ptMapList   = document.getElementById('ptMapList');
  const ptMapSearch = document.getElementById('ptMapSearch');

  const mapTierLookup = {};
  if (typeof ALL_MAPS !== 'undefined') ALL_MAPS.forEach(m => { mapTierLookup[m.name] = m.tier; });
  allPlayers.forEach(p => (p.maps_list || []).forEach(m => {
    if (!mapTierLookup[m.map] && m.tier) mapTierLookup[m.map] = m.tier;
  }));

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

document.getElementById('tabOverall').addEventListener('click', () => {
  selectedMap = null;
  currentPage = 1;
  document.getElementById('tabOverall').classList.add('active');
  document.getElementById('tabMap').classList.remove('active');
  document.getElementById('mapSelector').classList.add('hidden');
  renderOverall();
});

document.getElementById('tabMap').addEventListener('click', () => {
  document.getElementById('tabMap').classList.add('active');
  document.getElementById('tabOverall').classList.remove('active');
  document.getElementById('mapSelector').classList.remove('hidden');
});

function timeSince(date) {
  const s = Math.floor((new Date() - date) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

init();

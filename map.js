const CACHE_BASE = 'https://raw.githubusercontent.com/rxdstrx/kzlb/main/cache';
const PAGE_SIZE  = 100;

const params  = new URLSearchParams(window.location.search);
const mapName = params.get('map');

let allRecords  = [];
let filtered    = [];
let currentPage = 1;
let activeCountry = 'all';

const loadingState = document.getElementById('loadingState');
const tableWrapper = document.getElementById('tableWrapper');
const mapBody      = document.getElementById('mapBody');
const noData       = document.getElementById('noData');

function timeToSeconds(t) {
  if (!t || t === '—') return Infinity;
  t = t.trim();
  const parts = t.split(':');
  try {
    if (parts.length === 3) return Math.abs(parseInt(parts[0])) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2]);
    if (parts.length === 2) return parseInt(parts[0]) * 60 + parseFloat(parts[1]);
  } catch {}
  return parseFloat(t);
}

async function init() {
  if (!mapName) {
    document.getElementById('mapTitle').textContent = 'No map specified';
    return;
  }

  const mapInfo = typeof ALL_MAPS !== 'undefined' ? ALL_MAPS.find(m => m.name === mapName) : null;
  const tier = mapInfo?.tier;

  document.getElementById('mapTitle').textContent = mapName;
  document.title = `KZ — ${mapName}`;

  if (mapInfo?.img) {
    const thumb = document.getElementById('mapThumb');
    thumb.src = mapInfo.img;
    thumb.style.display = 'block';
  }

  if (tier) {
    const badge = document.getElementById('mapTierBadge');
    badge.textContent = `Tier ${tier}`;
    badge.className = `tier-badge tier-${tier}`;
  }

  try {
    // Load all players from world cache
    const res  = await fetch(`${CACHE_BASE}/world-kz-players.json?bust=${Date.now()}`);
    const data = await res.json();
    const players = data.players || [];

    players.forEach(p => {
      const entry = (p.maps_list || []).find(m => m.map === mapName);
      if (entry) {
        allRecords.push({
          steamid:     p.steamid,
          nickname:    p.nickname,
          avatar:      p.avatar,
          country:     p.country || 'xx',
          time_record: entry.time_record,
          place_num:   entry.place_num,
          completions: entry.completions,
        });
      }
    });

    allRecords.sort((a, b) => timeToSeconds(a.time_record) - timeToSeconds(b.time_record));

    document.getElementById('mapSub').textContent =
      `${allRecords.length} player${allRecords.length !== 1 ? 's' : ''} with records · Sorted by fastest time`;

    buildCountryFilter();

    loadingState.classList.add('hidden');
    tableWrapper.classList.remove('hidden');
    applyFilter();
  } catch (e) {
    loadingState.querySelector('p').textContent = 'Failed to load records.';
  }
}

function buildCountryFilter() {
  const countries = [...new Set(allRecords.map(r => r.country))].sort();
  const allBtn = document.getElementById('mapAllBtn');
  const btn    = document.getElementById('mapCountryBtn');
  const list   = document.getElementById('mapCountryList');

  list.innerHTML = '';

  // All button
  allBtn.addEventListener('click', () => {
    activeCountry = 'all';
    allBtn.classList.add('active');
    btn.classList.remove('active');
    btn.textContent = 'Country ▾';
    list.classList.add('hidden');
    applyFilter();
  });

  // Country dropdown options
  countries.forEach(code => {
    const div = document.createElement('div');
    div.className = 'map-country-option';
    div.innerHTML = `<img src="https://flagcdn.com/w20/${code}.png" style="height:13px;border-radius:2px;vertical-align:middle;margin-right:6px">${code.toUpperCase()}`;
    div.addEventListener('click', () => {
      activeCountry = code;
      allBtn.classList.remove('active');
      btn.classList.add('active');
      btn.innerHTML = `<img src="https://flagcdn.com/w20/${code}.png" style="height:13px;border-radius:2px;vertical-align:middle;margin-right:6px">${code.toUpperCase()} ▾`;
      list.classList.add('hidden');
      applyFilter();
    });
    list.appendChild(div);
  });

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    list.classList.toggle('hidden');
  });

  document.addEventListener('click', () => list.classList.add('hidden'));
  list.addEventListener('click', e => e.stopPropagation());
}

function applyFilter() {
  filtered = activeCountry === 'all'
    ? allRecords
    : allRecords.filter(r => r.country === activeCountry);
  currentPage = 1;
  renderPage();
}

function renderPage() {
  mapBody.innerHTML = '';
  noData.classList.add('hidden');

  if (!filtered.length) {
    noData.classList.remove('hidden');
    return;
  }

  const start = (currentPage - 1) * PAGE_SIZE;
  const page  = filtered.slice(start, start + PAGE_SIZE);

  page.forEach((r, i) => {
    const rank = start + i + 1;
    const rankClass = rank === 1 ? 'top1' : rank === 2 ? 'top2' : rank === 3 ? 'top3' : '';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="rank-badge ${rankClass}">${rank}</span></td>
      <td>
        <div class="player-cell">
          <img class="player-thumb" src="${r.avatar}" onerror="this.style.display='none'" />
          <a class="player-nick" href="profile.html?steamid=${r.steamid}&country=${r.country}">${r.nickname}</a>
          <img src="https://flagcdn.com/w20/${r.country}.png" style="height:13px;border-radius:2px;vertical-align:middle;margin-left:4px">
        </div>
      </td>
      <td><span class="time-cell">${r.time_record}</span></td>
      <td><span class="pos-cell">${(r.place_num || '').replace(/\u00a0/g, ' ')}</span></td>
      <td><span class="runs-cell">${r.completions}</span></td>
    `;
    mapBody.appendChild(tr);
  });

  renderPagination(filtered.length);
}

function renderPagination(total) {
  const pag = document.getElementById('pagination');
  pag.innerHTML = '';
  const totalPages = Math.ceil(total / PAGE_SIZE);
  if (totalPages <= 1) return;

  pag.className = 'pagination';

  const prev = document.createElement('button');
  prev.className = 'page-btn' + (currentPage === 1 ? ' disabled' : '');
  prev.textContent = '← Prev';
  prev.disabled = currentPage === 1;
  prev.addEventListener('click', () => { currentPage--; renderPage(); window.scrollTo(0, 0); });

  const info = document.createElement('span');
  info.className = 'page-info';
  info.textContent = `Page ${currentPage} of ${totalPages}`;

  const next = document.createElement('button');
  next.className = 'page-btn' + (currentPage === totalPages ? ' disabled' : '');
  next.textContent = 'Next →';
  next.disabled = currentPage === totalPages;
  next.addEventListener('click', () => { currentPage++; renderPage(); window.scrollTo(0, 0); });

  pag.append(prev, info, next);
}

init();

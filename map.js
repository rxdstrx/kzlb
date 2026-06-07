const CACHE_BASE = 'https://raw.githubusercontent.com/rxdstrx/kzlb/main/cache';
const PAGE_SIZE  = 100;

const params  = new URLSearchParams(window.location.search);
const mapName = params.get('map');

let allRecords = [];
let filtered   = [];
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
  if (!mapName) { document.getElementById('mapTitle').textContent = 'No map specified'; return; }

  // Set map info
  const mapInfo = typeof ALL_MAPS !== 'undefined' ? ALL_MAPS.find(m => m.name === mapName) : null;
  document.getElementById('mapTitle').textContent = mapName;
  document.title = `KZ — ${mapName}`;
  if (mapInfo?.img) {
    document.getElementById('mapThumb').src = mapInfo.img;
    document.getElementById('mapThumb').style.display = 'block';
  }

  // Load all country caches that have this map
  try {
    const ptRes  = await fetch(`${CACHE_BASE}/pt-kz-players.json?bust=${Date.now()}`);
    const ptData = await ptRes.json();
    const ptPlayers = ptData.players || [];

    ptPlayers.forEach(p => {
      const entry = (p.maps_list || []).find(m => m.map === mapName);
      if (entry) {
        allRecords.push({
          steamid: p.steamid,
          nickname: p.nickname,
          avatar: p.avatar,
          country: 'pt',
          countryFlag: '🇵🇹',
          time_record: entry.time_record,
          place_num: entry.place_num,
          completions: entry.completions,
        });
      }
    });

    allRecords.sort((a, b) => timeToSeconds(a.time_record) - timeToSeconds(b.time_record));
    document.getElementById('mapSub').textContent = `${allRecords.length} records found`;
    loadingState.classList.add('hidden');
    tableWrapper.classList.remove('hidden');
    applyFilter();
  } catch (e) {
    loadingState.querySelector('p').textContent = 'Failed to load records.';
  }
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
          <a class="player-nick" href="profile.html?steamid=${r.steamid}">${r.nickname}</a>
          <span style="font-size:1rem">${r.countryFlag}</span>
        </div>
      </td>
      <td><span class="time-cell">${r.time_record}</span></td>
      <td><span class="pos-cell">${r.place_num}</span></td>
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
  prev.addEventListener('click', () => { currentPage--; renderPage(); });

  const info = document.createElement('span');
  info.className = 'page-info';
  info.textContent = `Page ${currentPage} of ${totalPages}`;

  const next = document.createElement('button');
  next.className = 'page-btn' + (currentPage === totalPages ? ' disabled' : '');
  next.textContent = 'Next →';
  next.disabled = currentPage === totalPages;
  next.addEventListener('click', () => { currentPage++; renderPage(); });

  pag.append(prev, info, next);
}

// Country filter chips
document.getElementById('countryChips').addEventListener('click', e => {
  const chip = e.target.closest('.map-country-chip');
  if (!chip) return;
  activeCountry = chip.dataset.country;
  document.querySelectorAll('.map-country-chip').forEach(c => c.classList.toggle('active', c === chip));
  applyFilter();
});

// Add CSS for map page elements
const style = document.createElement('style');
style.textContent = `
.map-hero-thumb { width:80px;height:80px;border-radius:12px;object-fit:cover;flex-shrink:0; }
.map-country-filter { display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap; }
.map-filter-label { font-size:0.8rem;color:rgba(255,255,255,0.35); }
.map-country-chips { display:flex;gap:6px;flex-wrap:wrap; }
.map-country-chip { padding:5px 12px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);border-radius:20px;color:rgba(255,255,255,0.5);font-size:0.78rem;cursor:pointer;transition:all 0.12s; }
.map-country-chip:hover { background:rgba(255,255,255,0.09);color:#fff; }
.map-country-chip.active { background:rgba(129,140,248,0.2);border-color:rgba(129,140,248,0.4);color:#a5b4fc; }
`;
document.head.appendChild(style);

init();

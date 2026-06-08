const CACHE_BASE = 'https://raw.githubusercontent.com/rxdstrx/kzlb/main/cache';
const PAGE_SIZE  = 100;

const ALL_COUNTRIES = [
  {code:'af',name:'Afghanistan'},{code:'al',name:'Albania'},{code:'dz',name:'Algeria'},
  {code:'ad',name:'Andorra'},{code:'ao',name:'Angola'},{code:'ag',name:'Antigua and Barbuda'},
  {code:'ar',name:'Argentina'},{code:'am',name:'Armenia'},{code:'au',name:'Australia'},
  {code:'at',name:'Austria'},{code:'az',name:'Azerbaijan'},{code:'bs',name:'Bahamas'},
  {code:'bh',name:'Bahrain'},{code:'bd',name:'Bangladesh'},{code:'by',name:'Belarus'},
  {code:'be',name:'Belgium'},{code:'bz',name:'Belize'},{code:'bj',name:'Benin'},
  {code:'bt',name:'Bhutan'},{code:'bo',name:'Bolivia'},{code:'ba',name:'Bosnia and Herzegovina'},
  {code:'bw',name:'Botswana'},{code:'br',name:'Brazil'},{code:'bn',name:'Brunei'},
  {code:'bg',name:'Bulgaria'},{code:'bf',name:'Burkina Faso'},{code:'bi',name:'Burundi'},
  {code:'cv',name:'Cape Verde'},{code:'kh',name:'Cambodia'},{code:'cm',name:'Cameroon'},
  {code:'ca',name:'Canada'},{code:'cf',name:'Central African Republic'},{code:'td',name:'Chad'},
  {code:'cl',name:'Chile'},{code:'cn',name:'China'},{code:'co',name:'Colombia'},
  {code:'km',name:'Comoros'},{code:'cg',name:'Congo'},{code:'cr',name:'Costa Rica'},
  {code:'hr',name:'Croatia'},{code:'cu',name:'Cuba'},{code:'cy',name:'Cyprus'},
  {code:'cz',name:'Czech Republic'},{code:'dk',name:'Denmark'},{code:'dj',name:'Djibouti'},
  {code:'do',name:'Dominican Republic'},{code:'ec',name:'Ecuador'},{code:'eg',name:'Egypt'},
  {code:'sv',name:'El Salvador'},{code:'gq',name:'Equatorial Guinea'},{code:'er',name:'Eritrea'},
  {code:'ee',name:'Estonia'},{code:'sz',name:'Eswatini'},{code:'et',name:'Ethiopia'},
  {code:'fj',name:'Fiji'},{code:'fi',name:'Finland'},{code:'fr',name:'France'},
  {code:'ga',name:'Gabon'},{code:'gm',name:'Gambia'},{code:'ge',name:'Georgia'},
  {code:'de',name:'Germany'},{code:'gh',name:'Ghana'},{code:'gr',name:'Greece'},
  {code:'gt',name:'Guatemala'},{code:'gn',name:'Guinea'},{code:'gw',name:'Guinea-Bissau'},
  {code:'gy',name:'Guyana'},{code:'ht',name:'Haiti'},{code:'hn',name:'Honduras'},
  {code:'hu',name:'Hungary'},{code:'hk',name:'Hong Kong'},{code:'is',name:'Iceland'},
  {code:'in',name:'India'},{code:'id',name:'Indonesia'},{code:'ir',name:'Iran'},
  {code:'iq',name:'Iraq'},{code:'ie',name:'Ireland'},{code:'il',name:'Israel'},
  {code:'it',name:'Italy'},{code:'jm',name:'Jamaica'},{code:'jp',name:'Japan'},
  {code:'jo',name:'Jordan'},{code:'kz',name:'Kazakhstan'},{code:'ke',name:'Kenya'},
  {code:'kw',name:'Kuwait'},{code:'kg',name:'Kyrgyzstan'},{code:'la',name:'Laos'},
  {code:'lv',name:'Latvia'},{code:'lb',name:'Lebanon'},{code:'ls',name:'Lesotho'},
  {code:'lr',name:'Liberia'},{code:'ly',name:'Libya'},{code:'li',name:'Liechtenstein'},
  {code:'lt',name:'Lithuania'},{code:'lu',name:'Luxembourg'},{code:'mg',name:'Madagascar'},
  {code:'mw',name:'Malawi'},{code:'my',name:'Malaysia'},{code:'mv',name:'Maldives'},
  {code:'ml',name:'Mali'},{code:'mt',name:'Malta'},{code:'mr',name:'Mauritania'},
  {code:'mu',name:'Mauritius'},{code:'mx',name:'Mexico'},{code:'md',name:'Moldova'},
  {code:'mc',name:'Monaco'},{code:'mn',name:'Mongolia'},{code:'me',name:'Montenegro'},
  {code:'ma',name:'Morocco'},{code:'mz',name:'Mozambique'},{code:'mm',name:'Myanmar'},
  {code:'na',name:'Namibia'},{code:'np',name:'Nepal'},{code:'nl',name:'Netherlands'},
  {code:'nz',name:'New Zealand'},{code:'ni',name:'Nicaragua'},{code:'ne',name:'Niger'},
  {code:'ng',name:'Nigeria'},{code:'mk',name:'North Macedonia'},{code:'no',name:'Norway'},
  {code:'om',name:'Oman'},{code:'pk',name:'Pakistan'},{code:'pa',name:'Panama'},
  {code:'pg',name:'Papua New Guinea'},{code:'py',name:'Paraguay'},{code:'pe',name:'Peru'},
  {code:'ph',name:'Philippines'},{code:'pl',name:'Poland'},{code:'pt',name:'Portugal'},
  {code:'qa',name:'Qatar'},{code:'ro',name:'Romania'},{code:'ru',name:'Russia'},
  {code:'rw',name:'Rwanda'},{code:'sa',name:'Saudi Arabia'},{code:'sn',name:'Senegal'},
  {code:'rs',name:'Serbia'},{code:'sl',name:'Sierra Leone'},{code:'sg',name:'Singapore'},
  {code:'sk',name:'Slovakia'},{code:'si',name:'Slovenia'},{code:'so',name:'Somalia'},
  {code:'za',name:'South Africa'},{code:'kr',name:'South Korea'},{code:'ss',name:'South Sudan'},
  {code:'es',name:'Spain'},{code:'lk',name:'Sri Lanka'},{code:'sd',name:'Sudan'},
  {code:'sr',name:'Suriname'},{code:'se',name:'Sweden'},{code:'ch',name:'Switzerland'},
  {code:'sy',name:'Syria'},{code:'tw',name:'Taiwan'},{code:'tj',name:'Tajikistan'},
  {code:'tz',name:'Tanzania'},{code:'th',name:'Thailand'},{code:'tl',name:'Timor-Leste'},
  {code:'tg',name:'Togo'},{code:'tt',name:'Trinidad and Tobago'},{code:'tn',name:'Tunisia'},
  {code:'tr',name:'Turkey'},{code:'tm',name:'Turkmenistan'},{code:'ug',name:'Uganda'},
  {code:'ua',name:'Ukraine'},{code:'ae',name:'United Arab Emirates'},{code:'gb',name:'United Kingdom'},
  {code:'us',name:'United States'},{code:'uy',name:'Uruguay'},{code:'uz',name:'Uzbekistan'},
  {code:'ve',name:'Venezuela'},{code:'vn',name:'Vietnam'},{code:'ye',name:'Yemen'},
  {code:'zm',name:'Zambia'},{code:'zw',name:'Zimbabwe'},
];

const params  = new URLSearchParams(window.location.search);
let mapName = params.get('map');
// Alias: redirect old name to new name
if (mapName === 'kz_woodstock') mapName = 'kz_woodstock_v2';

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
  const allBtn     = document.getElementById('mapAllBtn');
  const btn        = document.getElementById('mapCountryBtn');
  const list       = document.getElementById('mapCountryList');
  const optionsEl  = document.getElementById('mapCountryOptions');
  const searchEl   = document.getElementById('mapCountrySearch');

  optionsEl.innerHTML = '';

  // All button
  allBtn.addEventListener('click', () => {
    activeCountry = 'all';
    allBtn.classList.add('active');
    btn.classList.remove('active');
    btn.textContent = 'Country ▾';
    list.classList.add('hidden');
    applyFilter();
  });

  // Country dropdown — all 180 countries, show count badge if they have records
  const recordsByCountry = {};
  allRecords.forEach(r => { recordsByCountry[r.country] = (recordsByCountry[r.country] || 0) + 1; });

  ALL_COUNTRIES.forEach(({ code, name }) => {
    const count = recordsByCountry[code] || 0;
    const div = document.createElement('div');
    div.className = 'map-country-option';
    div.dataset.name = name.toLowerCase();
    div.style.opacity = count ? '1' : '0.4';
    div.innerHTML = `<img src="https://flagcdn.com/w20/${code}.png" style="height:13px;border-radius:2px;vertical-align:middle;margin-right:6px">${name}${count ? ` <span style="margin-left:auto;font-size:0.72rem;color:#a5b4fc;padding-left:8px">${count}</span>` : ''}`;
    div.style.display = 'flex';
    div.style.alignItems = 'center';
    div.addEventListener('click', () => {
      activeCountry = code;
      allBtn.classList.remove('active');
      btn.classList.add('active');
      btn.innerHTML = `<img src="https://flagcdn.com/w20/${code}.png" style="height:13px;border-radius:2px;vertical-align:middle;margin-right:6px">${name} ▾`;
      list.classList.add('hidden');
      searchEl.value = '';
      showAllOptions();
      applyFilter();
    });
    optionsEl.appendChild(div);
  });

  // Search filter
  function showAllOptions() {
    optionsEl.querySelectorAll('.map-country-option').forEach(el => el.style.display = 'flex');
  }
  searchEl.addEventListener('input', () => {
    const q = searchEl.value.toLowerCase().trim();
    optionsEl.querySelectorAll('.map-country-option').forEach(el => {
      el.style.display = el.dataset.name.includes(q) ? 'flex' : 'none';
    });
  });

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    list.classList.toggle('hidden');
    if (!list.classList.contains('hidden')) {
      searchEl.value = '';
      showAllOptions();
      setTimeout(() => searchEl.focus(), 50);
    }
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

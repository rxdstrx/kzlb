const CACHE_BASE = 'https://raw.githubusercontent.com/rxdstrx/kzlb/main/cache';
const PAGE_SIZE  = 100;
const UNKNOWN_FLAG_SRC = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 15'%3E%3Crect width='20' height='15' rx='2' fill='%23b0b7c3'/%3E%3Ctext x='10' y='11' font-size='10' text-anchor='middle' fill='%23fff' font-family='sans-serif' font-weight='bold'%3E%3F%3C/text%3E%3C/svg%3E";
function mapFlagImg(country) {
  if (!country || country === 'xx')
    return `<img src="${UNKNOWN_FLAG_SRC}" style="height:13px;border-radius:2px;vertical-align:middle;margin-left:4px" alt="?">`;
  return `<img src="https://flagcdn.com/w20/${country}.png" style="height:13px;border-radius:2px;vertical-align:middle;margin-left:4px" onerror="this.src='${UNKNOWN_FLAG_SRC}';this.onerror=null">`;
}
const SB_MAP_URL  = 'https://btcufotfvfnuoiokghjm.supabase.co';
const SB_MAP_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0Y3Vmb3RmdmZudW9pb2tnaGptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwODEzMTcsImV4cCI6MjA5NjY1NzMxN30.hj_whZDtPhqfC-5ktGvLfqoMBp_x3G8w3lv5IcBdCX4';
const SB_MAP_HDR  = { apikey: SB_MAP_ANON, Authorization: `Bearer ${SB_MAP_ANON}` };

// ── Role filter state ──
let mapRoleFilter    = 'all';
let mapRoleSteamids  = new Set();
let mapAllRoles      = [];
let mapPlayerRoleMap = new Map();

function _mapHexToRgb(hex) {
  hex = (hex || '#818cf8').replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  const n = parseInt(hex, 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

function _mapRoleBadgesHtml(steamid) {
  const roles = mapPlayerRoleMap.get(steamid);
  if (!roles || !roles.length) return '';
  const cfgMap = Object.fromEntries(mapAllRoles.map((r, i) => [r.name, { ...r, _idx: i }]));
  const sorted = [...roles].sort((a, b) => (cfgMap[a]?._idx ?? 9999) - (cfgMap[b]?._idx ?? 9999));
  return sorted.map(name => {
    const cfg = cfgMap[name] || { color: '#818cf8', icon: '' };
    const rgb = _mapHexToRgb(cfg.color);
    const icon = cfg.icon ? `<span class="role-badge-icon">${cfg.icon}</span>` : '';
    return `<span class="role-badge role-badge-sm" style="--rb-rgb:${rgb};--rb-color:${cfg.color}">${icon}<span class="role-badge-text">${name}</span></span>`;
  }).join('');
}

async function initMapRoleFilter() {
  try {
    // Roles + assignments change rarely — cache across page navigations (120s).
    let _roles, prRows;
    const _ck = 'kz_roles_cache_v1';
    try {
      const c = JSON.parse(sessionStorage.getItem(_ck) || 'null');
      if (c && Date.now() - c.t < 120000) { _roles = c.roles; prRows = c.pr; }
    } catch {}
    if (!_roles) {
      const [rolesRes, prRes] = await Promise.all([
        fetch(`${SB_MAP_URL}/rest/v1/roles?select=name,color,icon,show_in_filter&order=priority.asc.nullslast,created_at.asc`, { headers: SB_MAP_HDR }),
        fetch(`${SB_MAP_URL}/rest/v1/player_roles?select=steamid,role`, { headers: SB_MAP_HDR }),
      ]);
      _roles = rolesRes.ok ? await rolesRes.json() : [];
      prRows = prRes.ok ? await prRes.json() : [];
      try { sessionStorage.setItem(_ck, JSON.stringify({ t: Date.now(), roles: _roles, pr: prRows })); } catch {}
    }
    mapAllRoles = _roles;

    for (const { steamid, role } of prRows) {
      if (!mapPlayerRoleMap.has(steamid)) mapPlayerRoleMap.set(steamid, []);
      mapPlayerRoleMap.get(steamid).push(role);
    }

    const bar = document.getElementById('roleFilterBarMap');
    if (!bar || !mapAllRoles.length) return;
    bar.style.display = '';
    bar.querySelectorAll('[data-role]:not([data-role="all"])').forEach(el => el.remove());

    const cfgMap = Object.fromEntries(mapAllRoles.map(r => [r.name, r]));
    const filterRoles = mapAllRoles.filter(r => r.show_in_filter !== false);
    if (!filterRoles.length) return;
    filterRoles.forEach(r => {
      const btn = document.createElement('button');
      btn.className = 'role-filter-btn';
      btn.dataset.role = r.name;
      btn.textContent = (r.icon ? r.icon + ' ' : '') + r.name;
      btn.addEventListener('click', () => {
        mapRoleFilter = r.name;
        mapRoleSteamids = new Set(prRows.filter(x => x.role === r.name).map(x => x.steamid));
        bar.querySelectorAll('.role-filter-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.role === r.name);
          if (b.dataset.role === r.name) {
            const cfg = cfgMap[r.name];
            const rgb = _mapHexToRgb(cfg?.color);
            b.style.cssText = `background:rgba(${rgb},0.15);border-color:rgba(${rgb},0.4);color:${cfg?.color}`;
          } else { b.style.cssText = ''; }
        });
        currentPage = 1;
        applyFilter();
      });
      bar.appendChild(btn);
    });

    bar.querySelector('[data-role="all"]').addEventListener('click', function() {
      mapRoleFilter = 'all';
      mapRoleSteamids = new Set();
      bar.querySelectorAll('.role-filter-btn').forEach(b => { b.classList.toggle('active', b.dataset.role === 'all'); b.style.cssText = ''; });
      currentPage = 1;
      applyFilter();
    });
  } catch {}
}

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
  {code:'zm',name:'Zambia'},{code:'zw',name:'Zimbabwe'},{code:'va',name:'Vatican City'},
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

function fmtSeconds(totalSec) {
  const m = Math.floor(totalSec / 60);
  const s = totalSec - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(4).padStart(7, '0')}`;
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

  const SB_URL  = 'https://btcufotfvfnuoiokghjm.supabase.co';
  const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0Y3Vmb3RmdmZudW9pb2tnaGptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwODEzMTcsImV4cCI6MjA5NjY1NzMxN30.hj_whZDtPhqfC-5ktGvLfqoMBp_x3G8w3lv5IcBdCX4';
  const SB_HDR  = { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}` };

  try {
    // Load the free GitHub cache (has every player's name/avatar/country) and
    // ONLY this map's records from Supabase — not all players. Player info comes
    // from the free cache; we fetch from Supabase only the handful of players who
    // have a record here but aren't in the cache yet (added since last rebuild).
    const [ghRes, sbMapRes] = await Promise.all([
      fetch(`${CACHE_BASE}/world-kz-players.json?bust=${Date.now()}`).then(r => r.ok ? r.json() : null),
      fetch(`${SB_URL}/rest/v1/player_maps?map=eq.${encodeURIComponent(mapName)}&select=steamid,time_record,place_num,completions,points`, { headers: SB_HDR }).then(r => r.ok ? r.json() : []),
    ]);

    const ghPlayers  = ghRes?.players || [];
    const sbMapRows  = Array.isArray(sbMapRes) ? sbMapRes : [];

    // Player info (nickname/avatar/country) keyed by steamid — start from the free cache.
    const sbPlayerMap = new Map();
    ghPlayers.forEach(p => sbPlayerMap.set(p.steamid, { nickname: p.nickname, avatar: p.avatar, country: p.country || 'xx' }));

    // Fetch info only for players on this map who aren't in the cache yet, in safe chunks.
    const missingIds = [...new Set(sbMapRows.map(e => e.steamid).filter(id => !sbPlayerMap.has(id)))];
    for (let i = 0; i < missingIds.length; i += 150) {
      const chunk = missingIds.slice(i, i + 150);
      try {
        const res = await fetch(`${SB_URL}/rest/v1/players?steamid=in.(${chunk.join(',')})&select=steamid,nickname,avatar,country`, { headers: SB_HDR });
        if (res.ok) {
          const rows = await res.json();
          rows.forEach(p => sbPlayerMap.set(p.steamid, { nickname: p.nickname, avatar: p.avatar, country: p.country || 'xx' }));
        }
      } catch {}
    }

    // Start with GitHub records
    const seen = new Map();
    ghPlayers.forEach(p => {
      const entry = (p.maps_list || []).find(m => m.map === mapName);
      if (entry) {
        seen.set(p.steamid, {
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

    // Overlay/add Supabase records (fresher data, includes new players)
    sbMapRows.forEach(entry => {
      const sp = sbPlayerMap.get(entry.steamid);
      if (!sp) return;
      seen.set(entry.steamid, {
        steamid:     entry.steamid,
        nickname:    sp.nickname,
        avatar:      sp.avatar,
        country:     sp.country || 'xx',
        time_record: entry.time_record,
        place_num:   entry.place_num,
        completions: entry.completions,
      });
    });

    allRecords.push(...seen.values());
    allRecords.sort((a, b) => timeToSeconds(a.time_record) - timeToSeconds(b.time_record));

    // Normalize place_num denominators: use the highest total seen across all records
    let maxMapTotal = 0;
    allRecords.forEach(r => {
      const m = (r.place_num || '').replace(/[\s ]/g, '').match(/^(\d+)\/(\d+)$/);
      if (m) maxMapTotal = Math.max(maxMapTotal, parseInt(m[2], 10));
    });
    if (maxMapTotal > 0) {
      allRecords.forEach(r => {
        const m = (r.place_num || '').replace(/[\s ]/g, '').match(/^(\d+)\/(\d+)$/);
        if (m) r.place_num = `${m[1]}/${maxMapTotal}`;
      });
    }

    document.getElementById('mapSub').textContent =
      `${allRecords.length} player${allRecords.length !== 1 ? 's' : ''} with records · Sorted by fastest time`;

    // ── Map stats bar ─────────────────────────────────────────────────────────
    if (allRecords.length) {
      // Unique completions: take denominator from the largest place_num fraction seen
      const uniq = maxMapTotal > 0 ? maxMapTotal.toLocaleString() : allRecords.length.toLocaleString();

      // World record: first entry (already sorted fastest-first)
      const wr = allRecords[0];

      // Average time from all tracked records
      const times = allRecords.map(r => timeToSeconds(r.time_record)).filter(t => isFinite(t));
      const avgSec = times.length ? times.reduce((a, b) => a + b, 0) / times.length : null;

      document.getElementById('statCompletions').textContent = uniq;
      document.getElementById('statRecord').textContent = wr.time_record || '—';
      document.getElementById('statRecordHolder').textContent = wr.nickname ? `by ${wr.nickname}` : '';
      document.getElementById('statAvgTime').textContent = avgSec != null ? fmtSeconds(avgSec) : '—';

      // Your time: check localStorage for logged-in steamid
      const mySteamid = localStorage.getItem('kz_steam_id');
      const myRecord = mySteamid ? allRecords.find(r => String(r.steamid) === String(mySteamid)) : null;
      if (myRecord) {
        document.getElementById('statYourTime').textContent = myRecord.time_record || '—';
        const myRank = allRecords.indexOf(myRecord) + 1;
        document.getElementById('statYourRank').textContent = `#${myRank} on leaderboard`;
      } else {
        document.getElementById('statYourTime').textContent = '—';
        document.getElementById('statYourRank').textContent = mySteamid ? 'No record yet' : 'Log in to see';
      }

      document.getElementById('mapStatsBar').classList.remove('hidden');
    }

    buildCountryFilter();

    loadingState.classList.add('hidden');
    tableWrapper.classList.remove('hidden');
    applyFilter();
    initMapRoleFilter();
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
  let base = activeCountry === 'all'
    ? allRecords
    : allRecords.filter(r => r.country === activeCountry);

  if (mapRoleFilter !== 'all') {
    base = mapRoleSteamids.size > 0 ? base.filter(r => mapRoleSteamids.has(r.steamid)) : [];
  }

  filtered = base;
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
          ${_mapRoleBadgesHtml(r.steamid)}
          ${mapFlagImg(r.country)}
        </div>
      </td>
      <td><span class="time-cell">${r.time_record}</span></td>
      <td><span class="pos-cell">${(r.place_num || '').replace(/\u00c2\u00a0|\u00a0/g, ' ')}</span></td>
      <td><span class="runs-cell">${r.completions}</span></td>
    `;
    mapBody.appendChild(tr);
  });

  renderPagination(filtered.length);
  renderPinnedSelf();
}

function renderPinnedSelf() {
  const existing = document.getElementById('pinned-self-row');
  if (existing) existing.remove();

  const auth = typeof getAuth === 'function' ? getAuth() : null;
  if (!auth) return;

  // Find the player's record among the currently filtered list (for rank)
  const idxFiltered = filtered.findIndex(r => r.steamid === auth.steamid);
  // Also check if they have a record at all (in "all" records)
  const selfRecord = allRecords.find(r => r.steamid === auth.steamid);

  // When filtering by a specific country, only show pinned row if player belongs to that country
  if (activeCountry !== 'all' && auth.country !== activeCountry) return;

  const tr = document.createElement('tr');
  tr.id = 'pinned-self-row';
  tr.className = 'pinned-self-row';

  if (idxFiltered !== -1) {
    // Player has a record and is visible in the current filter
    const r = filtered[idxFiltered];
    const rank = idxFiltered + 1;
    const rankClass = rank === 1 ? 'top1' : rank === 2 ? 'top2' : rank === 3 ? 'top3' : '';
    tr.innerHTML = `
      <td><span class="rank-badge ${rankClass}">${rank}</span></td>
      <td><div class="player-cell">
        <img class="player-thumb" src="${r.avatar || auth.avatar || ''}" onerror="this.style.display='none'" />
        <a class="player-nick" href="profile.html?steamid=${r.steamid}&country=${r.country}">${r.nickname}</a>
        ${mapFlagImg(r.country)}
        <span class="pinned-self-badge">📍 You</span>
      </div></td>
      <td><span class="time-cell">${r.time_record}</span></td>
      <td><span class="pos-cell">${(r.place_num || '').replace(/\u00c2\u00a0|\u00a0/g, ' ')}</span></td>
      <td><span class="runs-cell">${r.completions}</span></td>
    `;
  } else if (selfRecord && activeCountry !== 'all') {
    // Player has a record but is filtered out by country — show their global rank with note
    const idxAll = allRecords.findIndex(r => r.steamid === auth.steamid);
    const rank = idxAll + 1;
    const rankClass = rank === 1 ? 'top1' : rank === 2 ? 'top2' : rank === 3 ? 'top3' : '';
    tr.innerHTML = `
      <td><span class="rank-badge ${rankClass}">#${rank} all</span></td>
      <td><div class="player-cell">
        <img class="player-thumb" src="${selfRecord.avatar || auth.avatar || ''}" onerror="this.style.display='none'" />
        <a class="player-nick" href="profile.html?steamid=${selfRecord.steamid}&country=${selfRecord.country}">${selfRecord.nickname}</a>
        ${mapFlagImg(selfRecord.country)}
        <span class="pinned-self-badge">📍 You</span>
      </div></td>
      <td><span class="time-cell">${selfRecord.time_record}</span></td>
      <td><span class="pos-cell">${(selfRecord.place_num || '').replace(/\u00c2\u00a0|\u00a0/g, ' ')}</span></td>
      <td><span class="runs-cell">${selfRecord.completions}</span></td>
    `;
  } else {
    // Player has no record on this map
    tr.innerHTML = `
      <td><span class="rank-badge">—</span></td>
      <td><div class="player-cell">
        <img class="player-thumb" src="${auth.avatar || ''}" onerror="this.style.display='none'" />
        <a class="player-nick" href="profile.html?steamid=${auth.steamid}">${auth.nickname || 'You'}</a>
        <span class="pinned-self-badge">📍 You</span>
      </div></td>
      <td><span class="time-cell">—</span></td>
      <td><span class="pos-cell">—</span></td>
      <td><span class="runs-cell">—</span></td>
    `;
  }
  mapBody.insertBefore(tr, mapBody.firstChild);
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

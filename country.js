const CACHE_BASE  = 'https://raw.githubusercontent.com/rxdstrx/kzlb/main/cache';
const SB_LB_URL   = 'https://btcufotfvfnuoiokghjm.supabase.co';
const SB_LB_ANON  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0Y3Vmb3RmdmZudW9pb2tnaGptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwODEzMTcsImV4cCI6MjA5NjY1NzMxN30.hj_whZDtPhqfC-5ktGvLfqoMBp_x3G8w3lv5IcBdCX4';
const SB_HDR_C    = { apikey: SB_LB_ANON, Authorization: `Bearer ${SB_LB_ANON}` };
const PAGE_SIZE = 100;

// ── Role filter state ──
let ctRoleFilter    = 'all';
let ctRoleSteamids  = new Set();
let ctAllRoles      = [];
let ctPlayerRoleMap = new Map();

function _ctHexToRgb(hex) {
  hex = (hex || '#818cf8').replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  const n = parseInt(hex, 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

function _ctRoleBadgesHtml(steamid) {
  const roles = ctPlayerRoleMap.get(steamid);
  if (!roles || !roles.length) return '';
  const cfgMap = Object.fromEntries(ctAllRoles.map(r => [r.name, r]));
  return roles.map(name => {
    const cfg = cfgMap[name] || { color: '#818cf8', icon: '' };
    const rgb = _ctHexToRgb(cfg.color);
    const icon = cfg.icon ? `<span class="role-badge-icon">${cfg.icon}</span>` : '';
    return `<span class="role-badge role-badge-sm" style="--rb-rgb:${rgb};--rb-color:${cfg.color}">${icon}<span class="role-badge-text">${name}</span></span>`;
  }).join('');
}

async function initCtRoleFilter() {
  try {
    const [rolesRes, prRes] = await Promise.all([
      fetch(`${SB_LB_URL}/rest/v1/roles?select=name,color,icon&order=created_at.asc`, { headers: SB_HDR_C }),
      fetch(`${SB_LB_URL}/rest/v1/player_roles?select=steamid,role`, { headers: SB_HDR_C }),
    ]);
    ctAllRoles = rolesRes.ok ? await rolesRes.json() : [];
    const prRows = prRes.ok ? await prRes.json() : [];

    for (const { steamid, role } of prRows) {
      if (!ctPlayerRoleMap.has(steamid)) ctPlayerRoleMap.set(steamid, []);
      ctPlayerRoleMap.get(steamid).push(role);
    }

    const bar = document.getElementById('roleFilterBar');
    if (!bar || !ctAllRoles.length) return;
    bar.style.display = '';
    bar.querySelectorAll('[data-role]:not([data-role="all"])').forEach(el => el.remove());

    const cfgMap = Object.fromEntries(ctAllRoles.map(r => [r.name, r]));
    ctAllRoles.forEach(r => {
      const btn = document.createElement('button');
      btn.className = 'role-filter-btn';
      btn.dataset.role = r.name;
      btn.textContent = (r.icon ? r.icon + ' ' : '') + r.name;
      btn.addEventListener('click', () => {
        ctRoleFilter = r.name;
        ctRoleSteamids = new Set(prRows.filter(x => x.role === r.name).map(x => x.steamid));
        bar.querySelectorAll('.role-filter-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.role === r.name);
          if (b.dataset.role === r.name) {
            const cfg = cfgMap[r.name];
            const rgb = _ctHexToRgb(cfg?.color);
            b.style.cssText = `background:rgba(${rgb},0.15);border-color:rgba(${rgb},0.4);color:${cfg?.color}`;
          } else { b.style.cssText = ''; }
        });
        currentPage = 1;
        if (selectedMap) renderByMap(selectedMap);
        else renderOverall();
      });
      bar.appendChild(btn);
    });

    bar.querySelector('[data-role="all"]').addEventListener('click', function() {
      ctRoleFilter = 'all';
      ctRoleSteamids = new Set();
      bar.querySelectorAll('.role-filter-btn').forEach(b => { b.classList.toggle('active', b.dataset.role === 'all'); b.style.cssText = ''; });
      currentPage = 1;
      if (selectedMap) renderByMap(selectedMap);
      else renderOverall();
    });
  } catch {}
}

// These may also be defined in auth.js (portugal.html loads both) — safe to redefine
function fmtPlace(kz_place) {
  const v = Number(kz_place);
  if (!kz_place || v === 0 || v === 9999) return '—';
  return '#' + v.toLocaleString();
}
function fmtMaps(kz_maps, maps_list) {
  if (kz_maps && kz_maps !== '0' && kz_maps !== 0) return String(kz_maps);
  const count = (maps_list || []).length;
  return count > 0 ? String(count) : '0 (0%)';
}

const COUNTRY_INFO = {
  af: { name: 'Afghanistan', flag: '🇦🇫' }, al: { name: 'Albania', flag: '🇦🇱' }, dz: { name: 'Algeria', flag: '🇩🇿' },
  ad: { name: 'Andorra', flag: '🇦🇩' }, ao: { name: 'Angola', flag: '🇦🇴' }, ag: { name: 'Antigua and Barbuda', flag: '🇦🇬' },
  ar: { name: 'Argentina', flag: '🇦🇷' }, am: { name: 'Armenia', flag: '🇦🇲' }, au: { name: 'Australia', flag: '🇦🇺' },
  at: { name: 'Austria', flag: '🇦🇹' }, az: { name: 'Azerbaijan', flag: '🇦🇿' }, bs: { name: 'Bahamas', flag: '🇧🇸' },
  bh: { name: 'Bahrain', flag: '🇧🇭' }, bd: { name: 'Bangladesh', flag: '🇧🇩' }, by: { name: 'Belarus', flag: '🇧🇾' },
  be: { name: 'Belgium', flag: '🇧🇪' }, bz: { name: 'Belize', flag: '🇧🇿' }, bj: { name: 'Benin', flag: '🇧🇯' },
  bt: { name: 'Bhutan', flag: '🇧🇹' }, bo: { name: 'Bolivia', flag: '🇧🇴' }, ba: { name: 'Bosnia and Herzegovina', flag: '🇧🇦' },
  bw: { name: 'Botswana', flag: '🇧🇼' }, br: { name: 'Brazil', flag: '🇧🇷' }, bn: { name: 'Brunei', flag: '🇧🇳' },
  bg: { name: 'Bulgaria', flag: '🇧🇬' }, bf: { name: 'Burkina Faso', flag: '🇧🇫' }, bi: { name: 'Burundi', flag: '🇧🇮' },
  cv: { name: 'Cape Verde', flag: '🇨🇻' }, kh: { name: 'Cambodia', flag: '🇰🇭' }, cm: { name: 'Cameroon', flag: '🇨🇲' },
  ca: { name: 'Canada', flag: '🇨🇦' }, cf: { name: 'Central African Republic', flag: '🇨🇫' }, td: { name: 'Chad', flag: '🇹🇩' },
  cl: { name: 'Chile', flag: '🇨🇱' }, cn: { name: 'China', flag: '🇨🇳' }, co: { name: 'Colombia', flag: '🇨🇴' },
  km: { name: 'Comoros', flag: '🇰🇲' }, cg: { name: 'Congo', flag: '🇨🇬' }, cr: { name: 'Costa Rica', flag: '🇨🇷' },
  hr: { name: 'Croatia', flag: '🇭🇷' }, cu: { name: 'Cuba', flag: '🇨🇺' }, cy: { name: 'Cyprus', flag: '🇨🇾' },
  cz: { name: 'Czech Republic', flag: '🇨🇿' }, dk: { name: 'Denmark', flag: '🇩🇰' }, dj: { name: 'Djibouti', flag: '🇩🇯' },
  do: { name: 'Dominican Republic', flag: '🇩🇴' }, ec: { name: 'Ecuador', flag: '🇪🇨' }, eg: { name: 'Egypt', flag: '🇪🇬' },
  sv: { name: 'El Salvador', flag: '🇸🇻' }, gq: { name: 'Equatorial Guinea', flag: '🇬🇶' }, er: { name: 'Eritrea', flag: '🇪🇷' },
  ee: { name: 'Estonia', flag: '🇪🇪' }, sz: { name: 'Eswatini', flag: '🇸🇿' }, et: { name: 'Ethiopia', flag: '🇪🇹' },
  fj: { name: 'Fiji', flag: '🇫🇯' }, fi: { name: 'Finland', flag: '🇫🇮' }, fr: { name: 'France', flag: '🇫🇷' },
  ga: { name: 'Gabon', flag: '🇬🇦' }, gm: { name: 'Gambia', flag: '🇬🇲' }, ge: { name: 'Georgia', flag: '🇬🇪' },
  de: { name: 'Germany', flag: '🇩🇪' }, gh: { name: 'Ghana', flag: '🇬🇭' }, gr: { name: 'Greece', flag: '🇬🇷' },
  gt: { name: 'Guatemala', flag: '🇬🇹' }, gn: { name: 'Guinea', flag: '🇬🇳' }, gw: { name: 'Guinea-Bissau', flag: '🇬🇼' },
  gy: { name: 'Guyana', flag: '🇬🇾' }, ht: { name: 'Haiti', flag: '🇭🇹' }, hn: { name: 'Honduras', flag: '🇭🇳' },
  hu: { name: 'Hungary', flag: '🇭🇺' }, hk: { name: 'Hong Kong', flag: '🇭🇰' }, is: { name: 'Iceland', flag: '🇮🇸' }, in: { name: 'India', flag: '🇮🇳' },
  id: { name: 'Indonesia', flag: '🇮🇩' }, ir: { name: 'Iran', flag: '🇮🇷' }, iq: { name: 'Iraq', flag: '🇮🇶' },
  ie: { name: 'Ireland', flag: '🇮🇪' }, il: { name: 'Israel', flag: '🇮🇱' }, it: { name: 'Italy', flag: '🇮🇹' },
  jm: { name: 'Jamaica', flag: '🇯🇲' }, jp: { name: 'Japan', flag: '🇯🇵' }, jo: { name: 'Jordan', flag: '🇯🇴' },
  kz: { name: 'Kazakhstan', flag: '🇰🇿' }, ke: { name: 'Kenya', flag: '🇰🇪' }, kw: { name: 'Kuwait', flag: '🇰🇼' },
  kg: { name: 'Kyrgyzstan', flag: '🇰🇬' }, la: { name: 'Laos', flag: '🇱🇦' }, lv: { name: 'Latvia', flag: '🇱🇻' },
  lb: { name: 'Lebanon', flag: '🇱🇧' }, ls: { name: 'Lesotho', flag: '🇱🇸' }, lr: { name: 'Liberia', flag: '🇱🇷' },
  ly: { name: 'Libya', flag: '🇱🇾' }, li: { name: 'Liechtenstein', flag: '🇱🇮' }, lt: { name: 'Lithuania', flag: '🇱🇹' },
  lu: { name: 'Luxembourg', flag: '🇱🇺' }, mg: { name: 'Madagascar', flag: '🇲🇬' }, mw: { name: 'Malawi', flag: '🇲🇼' },
  my: { name: 'Malaysia', flag: '🇲🇾' }, mv: { name: 'Maldives', flag: '🇲🇻' }, ml: { name: 'Mali', flag: '🇲🇱' },
  mt: { name: 'Malta', flag: '🇲🇹' }, mr: { name: 'Mauritania', flag: '🇲🇷' }, mu: { name: 'Mauritius', flag: '🇲🇺' },
  mx: { name: 'Mexico', flag: '🇲🇽' }, md: { name: 'Moldova', flag: '🇲🇩' }, mc: { name: 'Monaco', flag: '🇲🇨' },
  mn: { name: 'Mongolia', flag: '🇲🇳' }, me: { name: 'Montenegro', flag: '🇲🇪' }, ma: { name: 'Morocco', flag: '🇲🇦' },
  mz: { name: 'Mozambique', flag: '🇲🇿' }, mm: { name: 'Myanmar', flag: '🇲🇲' }, na: { name: 'Namibia', flag: '🇳🇦' },
  np: { name: 'Nepal', flag: '🇳🇵' }, nl: { name: 'Netherlands', flag: '🇳🇱' }, nz: { name: 'New Zealand', flag: '🇳🇿' },
  ni: { name: 'Nicaragua', flag: '🇳🇮' }, ne: { name: 'Niger', flag: '🇳🇪' }, ng: { name: 'Nigeria', flag: '🇳🇬' },
  mk: { name: 'North Macedonia', flag: '🇲🇰' }, no: { name: 'Norway', flag: '🇳🇴' }, om: { name: 'Oman', flag: '🇴🇲' },
  pk: { name: 'Pakistan', flag: '🇵🇰' }, pa: { name: 'Panama', flag: '🇵🇦' }, pg: { name: 'Papua New Guinea', flag: '🇵🇬' },
  py: { name: 'Paraguay', flag: '🇵🇾' }, pe: { name: 'Peru', flag: '🇵🇪' }, ph: { name: 'Philippines', flag: '🇵🇭' },
  pl: { name: 'Poland', flag: '🇵🇱' }, pt: { name: 'Portugal', flag: '🇵🇹' }, qa: { name: 'Qatar', flag: '🇶🇦' },
  ro: { name: 'Romania', flag: '🇷🇴' }, ru: { name: 'Russia', flag: '🇷🇺' }, rw: { name: 'Rwanda', flag: '🇷🇼' },
  sa: { name: 'Saudi Arabia', flag: '🇸🇦' }, sn: { name: 'Senegal', flag: '🇸🇳' }, rs: { name: 'Serbia', flag: '🇷🇸' },
  sl: { name: 'Sierra Leone', flag: '🇸🇱' }, sg: { name: 'Singapore', flag: '🇸🇬' }, sk: { name: 'Slovakia', flag: '🇸🇰' },
  si: { name: 'Slovenia', flag: '🇸🇮' }, so: { name: 'Somalia', flag: '🇸🇴' }, za: { name: 'South Africa', flag: '🇿🇦' },
  kr: { name: 'South Korea', flag: '🇰🇷' }, ss: { name: 'South Sudan', flag: '🇸🇸' }, es: { name: 'Spain', flag: '🇪🇸' },
  lk: { name: 'Sri Lanka', flag: '🇱🇰' }, sd: { name: 'Sudan', flag: '🇸🇩' }, sr: { name: 'Suriname', flag: '🇸🇷' },
  se: { name: 'Sweden', flag: '🇸🇪' }, ch: { name: 'Switzerland', flag: '🇨🇭' }, sy: { name: 'Syria', flag: '🇸🇾' },
  tw: { name: 'Taiwan', flag: '🇹🇼' }, tj: { name: 'Tajikistan', flag: '🇹🇯' }, tz: { name: 'Tanzania', flag: '🇹🇿' },
  th: { name: 'Thailand', flag: '🇹🇭' }, tl: { name: 'Timor-Leste', flag: '🇹🇱' }, tg: { name: 'Togo', flag: '🇹🇬' },
  tt: { name: 'Trinidad and Tobago', flag: '🇹🇹' }, tn: { name: 'Tunisia', flag: '🇹🇳' }, tr: { name: 'Turkey', flag: '🇹🇷' },
  tm: { name: 'Turkmenistan', flag: '🇹🇲' }, ug: { name: 'Uganda', flag: '🇺🇬' }, ua: { name: 'Ukraine', flag: '🇺🇦' },
  ae: { name: 'United Arab Emirates', flag: '🇦🇪' }, gb: { name: 'United Kingdom', flag: '🇬🇧' }, us: { name: 'United States', flag: '🇺🇸' },
  uy: { name: 'Uruguay', flag: '🇺🇾' }, uz: { name: 'Uzbekistan', flag: '🇺🇿' }, ve: { name: 'Venezuela', flag: '🇻🇪' },
  vn: { name: 'Vietnam', flag: '🇻🇳' }, ye: { name: 'Yemen', flag: '🇾🇪' }, zm: { name: 'Zambia', flag: '🇿🇲' },
  zw: { name: 'Zimbabwe', flag: '🇿🇼' }, va: { name: 'Vatican City', flag: '🇻🇦' },
};

const params = new URLSearchParams(location.search);
const countryCode = (window.COUNTRY_CODE || params.get('code') || 'xx').toLowerCase();
const info = COUNTRY_INFO[countryCode] || { name: countryCode.toUpperCase(), flag: '🌍' };

document.title = `KZ — ${info.name} Leaderboard`;
document.getElementById('countryFlag').innerHTML = `<img src="https://flagcdn.com/w80/${countryCode}.png" alt="${info.name}" style="height:48px;border-radius:4px;">`;
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
    // Try Supabase first (always fresh — bypass CDN cache)
    let loaded = false;
    try {
      const res = await fetch(
        `${SB_LB_URL}/rest/v1/players?country=eq.${countryCode}&order=kz_points.desc&select=steamid,nickname,avatar,country,kz_points,kz_place,kz_maps,maps_list&limit=20000`,
        { headers: { apikey: SB_LB_ANON, Authorization: `Bearer ${SB_LB_ANON}`, 'Cache-Control': 'no-cache' } }
      );
      if (res.ok) {
        const rows = await res.json();
        if (Array.isArray(rows)) {
          allPlayers = rows;
          ptSub.textContent = `${allPlayers.length} players`;
          loaded = true;
        }
      }
    } catch {}

    // Fallback to GitHub only if Supabase failed entirely
    if (!loaded) {
      const res = await fetch(`${CACHE_BASE}/${countryCode}-kz-players.json?bust=${Date.now()}`);
      if (!res.ok) throw new Error('No data');
      const data = await res.json();
      allPlayers = data.players || [];
      ptSub.textContent = `${allPlayers.length} players with KZ data · Updated ${timeSince(new Date(data.updated_at))} ago`;
    }

    // If logged-in user is missing from the list, fetch them directly (handles stale CDN/cache)
    const _selfAuth = typeof getAuth === 'function' ? getAuth() : null;
    if (_selfAuth && !allPlayers.some(p => String(p.steamid) === String(_selfAuth.steamid))) {
      try {
        const selfRes = await fetch(
          `${SB_LB_URL}/rest/v1/players?steamid=eq.${_selfAuth.steamid}&select=steamid,nickname,avatar,country,kz_points,kz_place,kz_maps,maps_list&limit=1`,
          { headers: { apikey: SB_LB_ANON, Authorization: `Bearer ${SB_LB_ANON}`, 'Cache-Control': 'no-cache' } }
        );
        if (selfRes.ok) {
          const selfRows = await selfRes.json();
          if (selfRows?.length && String(selfRows[0].country) === countryCode) {
            allPlayers = [...allPlayers, selfRows[0]];
          }
        }
      } catch {}
    }

    loadingState.classList.add('hidden');
    tableWrapper.classList.remove('hidden');
    renderOverall();
    buildMapList();

    // Inject role filter bar if not already in the HTML (for country pages without it)
    if (!document.getElementById('roleFilterBar')) {
      const bar = document.createElement('div');
      bar.id = 'roleFilterBar';
      bar.className = 'role-filter-bar';
      bar.style.display = 'none';
      bar.innerHTML = '<span class="role-filter-label">Show:</span><button class="role-filter-btn active" data-role="all">All Players</button>';
      const tabs = document.getElementById('tabOverall');
      if (tabs && tabs.parentElement) {
        tabs.parentElement.parentElement.insertBefore(bar, tabs.parentElement.nextSibling);
      }
    }
    initCtRoleFilter();
  } catch {
    loadingState.querySelector('p').textContent = `No leaderboard data found for ${info.name} yet.`;
  }
}

function getOverallSorted() {
  let players = [...allPlayers];
  if (ctRoleFilter !== 'all') {
    players = ctRoleSteamids.size > 0 ? players.filter(p => ctRoleSteamids.has(p.steamid)) : [];
  }
  return players.sort((a, b) => b.kz_points - a.kz_points);
}

function getMapSorted(mapName) {
  let players = allPlayers;
  if (ctRoleFilter !== 'all') {
    players = ctRoleSteamids.size > 0 ? players.filter(p => ctRoleSteamids.has(p.steamid)) : [];
  }
  return players
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
    tr.dataset.steamid = p.steamid;
    tr.innerHTML = `
      <td><span class="rank-badge ${rankClass}">${rank}</span></td>
      <td>
        <div class="player-cell">
          <img class="player-thumb" src="${p.avatar}" onerror="this.style.display='none'" />
          <a class="player-nick" href="profile.html?steamid=${p.steamid}&country=${countryCode}">${p.nickname}</a>
          ${_ctRoleBadgesHtml(p.steamid)}
        </div>
      </td>
      <td><span class="pts-cell">${Number(p.kz_points).toFixed(0)}</span></td>
      <td><span class="pos-cell">${fmtPlace(p.kz_place)}</span></td>
      <td><span class="runs-cell">${fmtMaps(p.kz_maps, p.maps_list)}</span></td>
    `;
    ptBody.appendChild(tr);
  });

  renderPagination(sorted.length);
  renderPinnedSelfCountry(sorted);
}

let _lastSortedCountry = [];

function renderPinnedSelfCountry(sorted) {
  // Allow no-arg call (re-render with cached data, e.g. from updateNavAuth)
  if (sorted) _lastSortedCountry = sorted;
  const activeSorted = _lastSortedCountry;

  const existing = document.getElementById('pinned-self-row-country');
  if (existing) existing.remove();

  const auth = typeof getAuth === 'function' ? getAuth() : null;
  if (!auth) return;

  const idx = activeSorted.findIndex(p => p.steamid === auth.steamid);
  if (idx === -1) return;

  let tr;
  {
    const p = activeSorted[idx];
    const rank = idx + 1;
    const rankClass = rank === 1 ? 'top1' : rank === 2 ? 'top2' : rank === 3 ? 'top3' : '';
    tr = document.createElement('tr');
    tr.id = 'pinned-self-row-country';
    tr.className = 'pinned-self-row';
    tr.innerHTML = `
      <td><span class="rank-badge ${rankClass}">${rank}</span></td>
      <td>
        <div class="player-cell">
          <img class="player-thumb" src="${p.avatar || auth.avatar || ''}" onerror="this.style.display='none'" />
          <a class="player-nick" href="profile.html?steamid=${p.steamid}&country=${countryCode}">${p.nickname}</a>
          <span class="pinned-self-badge">📍 You</span>
        </div>
      </td>
      <td><span class="pts-cell">${Number(p.kz_points).toFixed(0)}</span></td>
      <td><span class="pos-cell">${fmtPlace(p.kz_place)}</span></td>
      <td><span class="runs-cell">${fmtMaps(p.kz_maps, p.maps_list)}</span></td>
    `;
  }
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
          <a class="player-nick" href="profile.html?steamid=${p.steamid}&country=${countryCode}">${p.nickname}</a>
          ${_ctRoleBadgesHtml(p.steamid)}
        </div>
      </td>
      <td><span class="time-cell">${p.entry.time_record}</span></td>
      <td><span class="pos-cell">${(p.entry.place_num || '').replace(/\u00c2\u00a0|\u00a0/g, ' ')}</span></td>
      <td><span class="runs-cell">${p.entry.completions}</span></td>
    `;
    ptBody.appendChild(tr);
  });

  renderPagination(sorted.length);
  renderPinnedSelfByMap(sorted, mapName);
}

function renderPinnedSelfByMap(sorted, mapName) {
  const existing = document.getElementById('pinned-self-row-country');
  if (existing) existing.remove();

  const auth = typeof getAuth === 'function' ? getAuth() : null;
  if (!auth) return;

  const idx = sorted.findIndex(p => p.steamid === auth.steamid);
  const tr = document.createElement('tr');
  tr.id = 'pinned-self-row-country';
  tr.className = 'pinned-self-row';

  if (idx === -1) return;

  {
    const p = sorted[idx];
    const rank = idx + 1;
    const rankClass = rank === 1 ? 'top1' : rank === 2 ? 'top2' : rank === 3 ? 'top3' : '';
    tr.innerHTML = `
      <td><span class="rank-badge ${rankClass}">${rank}</span></td>
      <td><div class="player-cell">
        <img class="player-thumb" src="${p.avatar || auth.avatar || ''}" onerror="this.style.display='none'" />
        <a class="player-nick" href="profile.html?steamid=${p.steamid}&country=${countryCode}">${p.nickname}</a>
        <span class="pinned-self-badge">📍 You</span>
      </div></td>
      <td><span class="time-cell">${p.entry.time_record}</span></td>
      <td><span class="pos-cell">${(p.entry.place_num || '').replace(/ /g, ' ')}</span></td>
      <td><span class="runs-cell">${p.entry.completions}</span></td>
    `;
  }
  ptBody.insertBefore(tr, ptBody.firstChild);
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

// KZ Admin Panel JS
const WORLD_CACHE = 'https://rxdstrx.github.io/kzlb/cache/world-kz-players.json';
const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:3000/api'
  : 'https://kzlb.vercel.app/api';

const ALL_COUNTRIES = [
  { code: 'xx', name: 'No flag', flag: '' },
  { code: 'af', name: 'Afghanistan', flag: '🇦🇫' },
  { code: 'al', name: 'Albania', flag: '🇦🇱' },
  { code: 'dz', name: 'Algeria', flag: '🇩🇿' },
  { code: 'ad', name: 'Andorra', flag: '🇦🇩' },
  { code: 'ao', name: 'Angola', flag: '🇦🇴' },
  { code: 'ag', name: 'Antigua & Barbuda', flag: '🇦🇬' },
  { code: 'ar', name: 'Argentina', flag: '🇦🇷' },
  { code: 'am', name: 'Armenia', flag: '🇦🇲' },
  { code: 'au', name: 'Australia', flag: '🇦🇺' },
  { code: 'at', name: 'Austria', flag: '🇦🇹' },
  { code: 'az', name: 'Azerbaijan', flag: '🇦🇿' },
  { code: 'bs', name: 'Bahamas', flag: '🇧🇸' },
  { code: 'bh', name: 'Bahrain', flag: '🇧🇭' },
  { code: 'bd', name: 'Bangladesh', flag: '🇧🇩' },
  { code: 'bb', name: 'Barbados', flag: '🇧🇧' },
  { code: 'by', name: 'Belarus', flag: '🇧🇾' },
  { code: 'be', name: 'Belgium', flag: '🇧🇪' },
  { code: 'bz', name: 'Belize', flag: '🇧🇿' },
  { code: 'bj', name: 'Benin', flag: '🇧🇯' },
  { code: 'bt', name: 'Bhutan', flag: '🇧🇹' },
  { code: 'bo', name: 'Bolivia', flag: '🇧🇴' },
  { code: 'ba', name: 'Bosnia & Herzegovina', flag: '🇧🇦' },
  { code: 'bw', name: 'Botswana', flag: '🇧🇼' },
  { code: 'br', name: 'Brazil', flag: '🇧🇷' },
  { code: 'bn', name: 'Brunei', flag: '🇧🇳' },
  { code: 'bg', name: 'Bulgaria', flag: '🇧🇬' },
  { code: 'bf', name: 'Burkina Faso', flag: '🇧🇫' },
  { code: 'bi', name: 'Burundi', flag: '🇧🇮' },
  { code: 'cv', name: 'Cabo Verde', flag: '🇨🇻' },
  { code: 'kh', name: 'Cambodia', flag: '🇰🇭' },
  { code: 'cm', name: 'Cameroon', flag: '🇨🇲' },
  { code: 'ca', name: 'Canada', flag: '🇨🇦' },
  { code: 'cf', name: 'Central African Republic', flag: '🇨🇫' },
  { code: 'td', name: 'Chad', flag: '🇹🇩' },
  { code: 'cl', name: 'Chile', flag: '🇨🇱' },
  { code: 'cn', name: 'China', flag: '🇨🇳' },
  { code: 'co', name: 'Colombia', flag: '🇨🇴' },
  { code: 'km', name: 'Comoros', flag: '🇰🇲' },
  { code: 'cd', name: 'Congo (DRC)', flag: '🇨🇩' },
  { code: 'cg', name: 'Congo (Republic)', flag: '🇨🇬' },
  { code: 'cr', name: 'Costa Rica', flag: '🇨🇷' },
  { code: 'hr', name: 'Croatia', flag: '🇭🇷' },
  { code: 'cu', name: 'Cuba', flag: '🇨🇺' },
  { code: 'cy', name: 'Cyprus', flag: '🇨🇾' },
  { code: 'cz', name: 'Czechia', flag: '🇨🇿' },
  { code: 'dk', name: 'Denmark', flag: '🇩🇰' },
  { code: 'dj', name: 'Djibouti', flag: '🇩🇯' },
  { code: 'dm', name: 'Dominica', flag: '🇩🇲' },
  { code: 'do', name: 'Dominican Republic', flag: '🇩🇴' },
  { code: 'ec', name: 'Ecuador', flag: '🇪🇨' },
  { code: 'eg', name: 'Egypt', flag: '🇪🇬' },
  { code: 'sv', name: 'El Salvador', flag: '🇸🇻' },
  { code: 'gq', name: 'Equatorial Guinea', flag: '🇬🇶' },
  { code: 'er', name: 'Eritrea', flag: '🇪🇷' },
  { code: 'ee', name: 'Estonia', flag: '🇪🇪' },
  { code: 'sz', name: 'Eswatini', flag: '🇸🇿' },
  { code: 'et', name: 'Ethiopia', flag: '🇪🇹' },
  { code: 'fj', name: 'Fiji', flag: '🇫🇯' },
  { code: 'fi', name: 'Finland', flag: '🇫🇮' },
  { code: 'fr', name: 'France', flag: '🇫🇷' },
  { code: 'ga', name: 'Gabon', flag: '🇬🇦' },
  { code: 'gm', name: 'Gambia', flag: '🇬🇲' },
  { code: 'ge', name: 'Georgia', flag: '🇬🇪' },
  { code: 'de', name: 'Germany', flag: '🇩🇪' },
  { code: 'gh', name: 'Ghana', flag: '🇬🇭' },
  { code: 'gr', name: 'Greece', flag: '🇬🇷' },
  { code: 'gd', name: 'Grenada', flag: '🇬🇩' },
  { code: 'gt', name: 'Guatemala', flag: '🇬🇹' },
  { code: 'gn', name: 'Guinea', flag: '🇬🇳' },
  { code: 'gw', name: 'Guinea-Bissau', flag: '🇬🇼' },
  { code: 'gy', name: 'Guyana', flag: '🇬🇾' },
  { code: 'ht', name: 'Haiti', flag: '🇭🇹' },
  { code: 'hn', name: 'Honduras', flag: '🇭🇳' },
  { code: 'hu', name: 'Hungary', flag: '🇭🇺' },
  { code: 'is', name: 'Iceland', flag: '🇮🇸' },
  { code: 'in', name: 'India', flag: '🇮🇳' },
  { code: 'id', name: 'Indonesia', flag: '🇮🇩' },
  { code: 'ir', name: 'Iran', flag: '🇮🇷' },
  { code: 'iq', name: 'Iraq', flag: '🇮🇶' },
  { code: 'ie', name: 'Ireland', flag: '🇮🇪' },
  { code: 'il', name: 'Israel', flag: '🇮🇱' },
  { code: 'it', name: 'Italy', flag: '🇮🇹' },
  { code: 'jm', name: 'Jamaica', flag: '🇯🇲' },
  { code: 'jp', name: 'Japan', flag: '🇯🇵' },
  { code: 'jo', name: 'Jordan', flag: '🇯🇴' },
  { code: 'kz', name: 'Kazakhstan', flag: '🇰🇿' },
  { code: 'ke', name: 'Kenya', flag: '🇰🇪' },
  { code: 'ki', name: 'Kiribati', flag: '🇰🇮' },
  { code: 'kp', name: 'North Korea', flag: '🇰🇵' },
  { code: 'kr', name: 'South Korea', flag: '🇰🇷' },
  { code: 'kw', name: 'Kuwait', flag: '🇰🇼' },
  { code: 'kg', name: 'Kyrgyzstan', flag: '🇰🇬' },
  { code: 'la', name: 'Laos', flag: '🇱🇦' },
  { code: 'lv', name: 'Latvia', flag: '🇱🇻' },
  { code: 'lb', name: 'Lebanon', flag: '🇱🇧' },
  { code: 'ls', name: 'Lesotho', flag: '🇱🇸' },
  { code: 'lr', name: 'Liberia', flag: '🇱🇷' },
  { code: 'ly', name: 'Libya', flag: '🇱🇾' },
  { code: 'li', name: 'Liechtenstein', flag: '🇱🇮' },
  { code: 'lt', name: 'Lithuania', flag: '🇱🇹' },
  { code: 'lu', name: 'Luxembourg', flag: '🇱🇺' },
  { code: 'mg', name: 'Madagascar', flag: '🇲🇬' },
  { code: 'mw', name: 'Malawi', flag: '🇲🇼' },
  { code: 'my', name: 'Malaysia', flag: '🇲🇾' },
  { code: 'mv', name: 'Maldives', flag: '🇲🇻' },
  { code: 'ml', name: 'Mali', flag: '🇲🇱' },
  { code: 'mt', name: 'Malta', flag: '🇲🇹' },
  { code: 'mh', name: 'Marshall Islands', flag: '🇲🇭' },
  { code: 'mr', name: 'Mauritania', flag: '🇲🇷' },
  { code: 'mu', name: 'Mauritius', flag: '🇲🇺' },
  { code: 'mx', name: 'Mexico', flag: '🇲🇽' },
  { code: 'fm', name: 'Micronesia', flag: '🇫🇲' },
  { code: 'md', name: 'Moldova', flag: '🇲🇩' },
  { code: 'mc', name: 'Monaco', flag: '🇲🇨' },
  { code: 'mn', name: 'Mongolia', flag: '🇲🇳' },
  { code: 'me', name: 'Montenegro', flag: '🇲🇪' },
  { code: 'ma', name: 'Morocco', flag: '🇲🇦' },
  { code: 'mz', name: 'Mozambique', flag: '🇲🇿' },
  { code: 'mm', name: 'Myanmar', flag: '🇲🇲' },
  { code: 'na', name: 'Namibia', flag: '🇳🇦' },
  { code: 'nr', name: 'Nauru', flag: '🇳🇷' },
  { code: 'np', name: 'Nepal', flag: '🇳🇵' },
  { code: 'nl', name: 'Netherlands', flag: '🇳🇱' },
  { code: 'nz', name: 'New Zealand', flag: '🇳🇿' },
  { code: 'ni', name: 'Nicaragua', flag: '🇳🇮' },
  { code: 'ne', name: 'Niger', flag: '🇳🇪' },
  { code: 'ng', name: 'Nigeria', flag: '🇳🇬' },
  { code: 'mk', name: 'North Macedonia', flag: '🇲🇰' },
  { code: 'no', name: 'Norway', flag: '🇳🇴' },
  { code: 'om', name: 'Oman', flag: '🇴🇲' },
  { code: 'pk', name: 'Pakistan', flag: '🇵🇰' },
  { code: 'pw', name: 'Palau', flag: '🇵🇼' },
  { code: 'pa', name: 'Panama', flag: '🇵🇦' },
  { code: 'pg', name: 'Papua New Guinea', flag: '🇵🇬' },
  { code: 'py', name: 'Paraguay', flag: '🇵🇾' },
  { code: 'pe', name: 'Peru', flag: '🇵🇪' },
  { code: 'ph', name: 'Philippines', flag: '🇵🇭' },
  { code: 'pl', name: 'Poland', flag: '🇵🇱' },
  { code: 'pt', name: 'Portugal', flag: '🇵🇹' },
  { code: 'qa', name: 'Qatar', flag: '🇶🇦' },
  { code: 'ro', name: 'Romania', flag: '🇷🇴' },
  { code: 'ru', name: 'Russia', flag: '🇷🇺' },
  { code: 'rw', name: 'Rwanda', flag: '🇷🇼' },
  { code: 'kn', name: 'Saint Kitts & Nevis', flag: '🇰🇳' },
  { code: 'lc', name: 'Saint Lucia', flag: '🇱🇨' },
  { code: 'vc', name: 'Saint Vincent & Grenadines', flag: '🇻🇨' },
  { code: 'ws', name: 'Samoa', flag: '🇼🇸' },
  { code: 'sm', name: 'San Marino', flag: '🇸🇲' },
  { code: 'st', name: 'São Tomé & Príncipe', flag: '🇸🇹' },
  { code: 'sa', name: 'Saudi Arabia', flag: '🇸🇦' },
  { code: 'sn', name: 'Senegal', flag: '🇸🇳' },
  { code: 'rs', name: 'Serbia', flag: '🇷🇸' },
  { code: 'sc', name: 'Seychelles', flag: '🇸🇨' },
  { code: 'sl', name: 'Sierra Leone', flag: '🇸🇱' },
  { code: 'sg', name: 'Singapore', flag: '🇸🇬' },
  { code: 'sk', name: 'Slovakia', flag: '🇸🇰' },
  { code: 'si', name: 'Slovenia', flag: '🇸🇮' },
  { code: 'sb', name: 'Solomon Islands', flag: '🇸🇧' },
  { code: 'so', name: 'Somalia', flag: '🇸🇴' },
  { code: 'za', name: 'South Africa', flag: '🇿🇦' },
  { code: 'ss', name: 'South Sudan', flag: '🇸🇸' },
  { code: 'es', name: 'Spain', flag: '🇪🇸' },
  { code: 'lk', name: 'Sri Lanka', flag: '🇱🇰' },
  { code: 'sd', name: 'Sudan', flag: '🇸🇩' },
  { code: 'sr', name: 'Suriname', flag: '🇸🇷' },
  { code: 'se', name: 'Sweden', flag: '🇸🇪' },
  { code: 'ch', name: 'Switzerland', flag: '🇨🇭' },
  { code: 'sy', name: 'Syria', flag: '🇸🇾' },
  { code: 'tw', name: 'Taiwan', flag: '🇹🇼' },
  { code: 'tj', name: 'Tajikistan', flag: '🇹🇯' },
  { code: 'tz', name: 'Tanzania', flag: '🇹🇿' },
  { code: 'th', name: 'Thailand', flag: '🇹🇭' },
  { code: 'tl', name: 'Timor-Leste', flag: '🇹🇱' },
  { code: 'tg', name: 'Togo', flag: '🇹🇬' },
  { code: 'to', name: 'Tonga', flag: '🇹🇴' },
  { code: 'tt', name: 'Trinidad & Tobago', flag: '🇹🇹' },
  { code: 'tn', name: 'Tunisia', flag: '🇹🇳' },
  { code: 'tr', name: 'Turkey', flag: '🇹🇷' },
  { code: 'tm', name: 'Turkmenistan', flag: '🇹🇲' },
  { code: 'tv', name: 'Tuvalu', flag: '🇹🇻' },
  { code: 'ug', name: 'Uganda', flag: '🇺🇬' },
  { code: 'ua', name: 'Ukraine', flag: '🇺🇦' },
  { code: 'ae', name: 'United Arab Emirates', flag: '🇦🇪' },
  { code: 'gb', name: 'United Kingdom', flag: '🇬🇧' },
  { code: 'us', name: 'United States', flag: '🇺🇸' },
  { code: 'uy', name: 'Uruguay', flag: '🇺🇾' },
  { code: 'uz', name: 'Uzbekistan', flag: '🇺🇿' },
  { code: 'vu', name: 'Vanuatu', flag: '🇻🇺' },
  { code: 've', name: 'Venezuela', flag: '🇻🇪' },
  { code: 'vn', name: 'Vietnam', flag: '🇻🇳' },
  { code: 'ye', name: 'Yemen', flag: '🇾🇪' },
  { code: 'zm', name: 'Zambia', flag: '🇿🇲' },
  { code: 'zw', name: 'Zimbabwe', flag: '🇿🇼' },
];

// ── State ─────────────────────────────────────────────────────────────────────
let adminPassword = '';
let allPlayers = [];
let filteredPlayers = [];

// ── DOM refs ──────────────────────────────────────────────────────────────────
const loginWrap = document.getElementById('loginWrap');
const adminWrap = document.getElementById('adminWrap');
const loginPassword = document.getElementById('loginPassword');
const loginBtn = document.getElementById('loginBtn');
const loginError = document.getElementById('loginError');
const logoutBtn = document.getElementById('logoutBtn');
const adminSub = document.getElementById('adminSub');
const adminSearch = document.getElementById('adminSearch');
const adminTableBody = document.getElementById('adminTableBody');
const addSteamId = document.getElementById('addSteamId');
const addCountry = document.getElementById('addCountry');
const addPlayerBtn = document.getElementById('addPlayerBtn');
const addStatus = document.getElementById('addStatus');

// ── Boot ──────────────────────────────────────────────────────────────────────
populateCountrySelect(addCountry);

const saved = sessionStorage.getItem('kz_admin_pw');
if (saved) {
  adminPassword = saved;
  showAdmin();
}

// ── Login ─────────────────────────────────────────────────────────────────────
loginBtn.addEventListener('click', doLogin);
loginPassword.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

function doLogin() {
  const pw = loginPassword.value.trim();
  if (!pw) return;
  adminPassword = pw;
  sessionStorage.setItem('kz_admin_pw', pw);
  loginError.classList.add('hidden');
  showAdmin();
}

function showAdmin() {
  loginWrap.style.display = 'none';
  adminWrap.classList.add('visible');
  loadPlayers();
}

logoutBtn.addEventListener('click', () => {
  sessionStorage.removeItem('kz_admin_pw');
  adminPassword = '';
  allPlayers = [];
  filteredPlayers = [];
  adminWrap.classList.remove('visible');
  loginWrap.style.display = '';
  loginPassword.value = '';
  adminTableBody.innerHTML = '<tr class="loading-row"><td colspan="6">Loading players…</td></tr>';
});

// ── Load players ──────────────────────────────────────────────────────────────
async function loadPlayers() {
  adminSub.textContent = 'Loading players…';
  try {
    const r = await fetch(WORLD_CACHE + '?bust=' + Date.now());
    const data = await r.json();
    allPlayers = data.players || [];
    allPlayers.sort((a, b) => b.kz_points - a.kz_points);
    filteredPlayers = [...allPlayers];
    updateStats();
    renderTable(filteredPlayers);
    adminSub.textContent = `${allPlayers.length} players loaded`;
  } catch (err) {
    adminSub.textContent = 'Failed to load players';
    adminTableBody.innerHTML = '<tr class="loading-row"><td colspan="6">Failed to load world cache.</td></tr>';
  }
}

// ── Stats ─────────────────────────────────────────────────────────────────────
function updateStats() {
  document.getElementById('statTotal').textContent = allPlayers.length;
  const countries = new Set(allPlayers.map(p => p.country).filter(c => c && c !== 'xx'));
  document.getElementById('statCountries').textContent = countries.size;
  const top = allPlayers[0];
  document.getElementById('statTop').textContent = top ? (top.nickname || top.steamid) : '—';
}

// ── Search ────────────────────────────────────────────────────────────────────
adminSearch.addEventListener('input', () => {
  const q = adminSearch.value.trim().toLowerCase();
  if (!q) {
    filteredPlayers = [...allPlayers];
  } else {
    filteredPlayers = allPlayers.filter(p =>
      (p.nickname || '').toLowerCase().includes(q) ||
      (p.steamid || '').includes(q) ||
      (p.country || '').includes(q) ||
      countryName(p.country).toLowerCase().includes(q)
    );
  }
  renderTable(filteredPlayers);
});

// ── Render table ──────────────────────────────────────────────────────────────
function renderTable(players) {
  if (!players.length) {
    adminTableBody.innerHTML = '<tr class="loading-row"><td colspan="6">No players found.</td></tr>';
    return;
  }

  const rows = players.map((p) => {
    const rank = allPlayers.indexOf(p) + 1;
    const avatar = p.avatar_url
      ? `<img class="player-row-avatar" src="${p.avatar_url}" alt="" onerror="this.style.display='none'">`
      : '';
    const flagSrc = p.country && p.country !== 'xx'
      ? `https://flagcdn.com/16x12/${p.country}.png`
      : '';
    const flagImg = flagSrc ? `<img class="flag-img" src="${flagSrc}" alt="">` : '';
    const points = (p.kz_points || 0).toLocaleString();
    const maps = p.map_count || 0;

    const selectId = `cs_${p.steamid}`;
    const statusId = `rs_${p.steamid}`;

    return `<tr data-steamid="${p.steamid}">
      <td>${rank}</td>
      <td>${avatar}<span class="player-row-nick">${escHtml(p.nickname || p.steamid)}</span></td>
      <td>
        ${flagImg}
        <select class="country-select-inline" id="${selectId}" data-original="${p.country || 'xx'}">
          ${countryOptions(p.country || 'xx')}
        </select>
      </td>
      <td>${points}</td>
      <td>${maps}</td>
      <td>
        <div class="action-btns">
          <button class="btn-save" onclick="saveCountry('${p.steamid}', '${selectId}', '${statusId}')">Save flag</button>
          <button class="btn-update" onclick="updatePlayer('${p.steamid}', '${statusId}')">Update</button>
          <button class="btn-roles" onclick="openRoleModal('${p.steamid}', '${escHtml(p.nickname || p.steamid)}')">🏷 Roles</button>
          <button class="btn-remove" onclick="removePlayer('${p.steamid}', '${statusId}')">Remove</button>
          <span class="row-status hidden" id="${statusId}"></span>
        </div>
      </td>
    </tr>`;
  });

  adminTableBody.innerHTML = rows.join('');
}

// ── Country helpers ───────────────────────────────────────────────────────────
function populateCountrySelect(sel) {
  sel.innerHTML = ALL_COUNTRIES.map(c =>
    `<option value="${c.code}">${c.flag ? c.flag + ' ' : ''}${c.name}</option>`
  ).join('');
}

function countryOptions(selected) {
  return ALL_COUNTRIES.map(c =>
    `<option value="${c.code}"${c.code === selected ? ' selected' : ''}>${c.flag ? c.flag + ' ' : ''}${c.name}</option>`
  ).join('');
}

function countryName(code) {
  const c = ALL_COUNTRIES.find(x => x.code === code);
  return c ? c.name : code || '';
}

// ── Actions ───────────────────────────────────────────────────────────────────
async function saveCountry(steamid, selectId, statusId) {
  const sel = document.getElementById(selectId);
  const country = sel.value;
  const original = sel.dataset.original;
  if (country === original) { showRowStatus(statusId, 'Already saved', 'success'); return; }

  setRowBusy(statusId, true);
  showRowStatus(statusId, '⏳ Moving…', 'loading');

  const ok = await callAdminApi({ action: 'move', steamid, country });
  if (ok) {
    sel.dataset.original = country;
    const p = allPlayers.find(x => x.steamid === steamid);
    if (p) p.country = country;
    showRowStatus(statusId, '✓ Queued!', 'success');
    toast('Country change queued — GitHub Action running', 'success');
    const row = document.querySelector(`tr[data-steamid="${steamid}"]`);
    if (row) {
      const flagCell = row.cells[2];
      const flagImg = flagCell.querySelector('.flag-img');
      const newFlag = country !== 'xx' ? `https://flagcdn.com/16x12/${country}.png` : '';
      if (newFlag) {
        if (flagImg) { flagImg.src = newFlag; }
        else {
          const img = document.createElement('img');
          img.className = 'flag-img';
          img.src = newFlag;
          img.alt = '';
          flagCell.insertBefore(img, flagCell.querySelector('select'));
        }
      } else if (flagImg) flagImg.remove();
    }
  } else {
    showRowStatus(statusId, '✗ Failed', 'error');
  }
  setRowBusy(statusId, false);
}

async function updatePlayer(steamid, statusId) {
  if (!confirm(`Update stats for ${steamid}?`)) return;
  setRowBusy(statusId, true);
  showRowStatus(statusId, '⏳ Queuing…', 'loading');
  const ok = await callAdminApi({ action: 'update', steamid });
  if (ok) {
    showRowStatus(statusId, '✓ Queued!', 'success');
    toast('Stats update queued — GitHub Action running', 'success');
  } else {
    showRowStatus(statusId, '✗ Failed', 'error');
  }
  setRowBusy(statusId, false);
}

async function removePlayer(steamid, statusId) {
  const p = allPlayers.find(x => x.steamid === steamid);
  const nick = p ? (p.nickname || steamid) : steamid;
  if (!confirm(`Remove "${nick}" permanently from leaderboard?`)) return;
  setRowBusy(statusId, true);
  showRowStatus(statusId, '⏳ Removing…', 'loading');
  const ok = await callAdminApi({ action: 'remove', steamid });
  if (ok) {
    allPlayers = allPlayers.filter(x => x.steamid !== steamid);
    filteredPlayers = filteredPlayers.filter(x => x.steamid !== steamid);
    updateStats();
    const row = document.querySelector(`tr[data-steamid="${steamid}"]`);
    if (row) {
      row.style.opacity = '0.3';
      setTimeout(() => row.remove(), 600);
    }
    toast(`"${nick}" removed — GitHub Action running`, 'success');
  } else {
    showRowStatus(statusId, '✗ Failed', 'error');
    setRowBusy(statusId, false);
  }
}

// ── Add player ────────────────────────────────────────────────────────────────
addPlayerBtn.addEventListener('click', async () => {
  const steamid = addSteamId.value.trim();
  const country = addCountry.value;

  if (!/^\d{17}$/.test(steamid)) {
    showEl(addStatus, '✗ Invalid Steam ID64 (must be 17 digits)', 'error');
    return;
  }

  if (allPlayers.find(x => x.steamid === steamid)) {
    showEl(addStatus, '✗ Player already in leaderboard. Use Update instead.', 'error');
    return;
  }

  addPlayerBtn.disabled = true;
  showEl(addStatus, '⏳ Adding…', 'loading');

  const ok = await callAdminApi({ action: 'add', steamid, country });
  if (ok) {
    showEl(addStatus, '✓ Queued! GitHub Action running.', 'success');
    toast('Add player queued — will appear after workflow completes', 'success');
    addSteamId.value = '';
    addCountry.value = 'xx';
  } else {
    showEl(addStatus, '✗ Failed to queue. Check password & API.', 'error');
  }
  addPlayerBtn.disabled = false;
});

// ── API call ──────────────────────────────────────────────────────────────────
async function callAdminApi(body) {
  try {
    const r = await fetch(`${API_BASE}/admin-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, password: adminPassword }),
    });
    if (r.status === 401) {
      toast('Wrong password — please log out and try again', 'error');
      return false;
    }
    const data = await r.json();
    if (!r.ok) {
      toast('API error: ' + (data.error || r.status), 'error');
      return false;
    }
    return true;
  } catch (err) {
    toast('Network error: ' + err.message, 'error');
    return false;
  }
}

// ── UI helpers ────────────────────────────────────────────────────────────────
function showRowStatus(id, msg, type) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className = `row-status ${type}`;
  el.classList.remove('hidden');
  if (type === 'success' || type === 'error') {
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.add('hidden'), 4000);
  }
}

function showEl(el, msg, type) {
  el.textContent = msg;
  el.className = `row-status ${type}`;
  el.classList.remove('hidden');
}

function setRowBusy(statusId, busy) {
  const row = document.getElementById(statusId)?.closest('tr');
  if (!row) return;
  row.querySelectorAll('button').forEach(b => b.disabled = busy);
}

function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Role Management ───────────────────────────────────────────────────────────
const ADMIN_SB_URL  = 'https://btcufotfvfnuoiokghjm.supabase.co';
const ADMIN_SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0Y3Vmb3RmdmZudW9pb2tnaGptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwODEzMTcsImV4cCI6MjA5NjY1NzMxN30.hj_whZDtPhqfC-5ktGvLfqoMBp_x3G8w3lv5IcBdCX4';
const ADMIN_SB_HDR  = { apikey: ADMIN_SB_ANON, Authorization: `Bearer ${ADMIN_SB_ANON}` };

let adminRoles = [];
let roleModalSteamid = '';

function adminHexToRgb(hex) {
  hex = (hex || '#818cf8').replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  const n = parseInt(hex, 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

// Roles section toggle
document.getElementById('rolesSectionToggle').addEventListener('click', () => {
  const body = document.getElementById('rolesSectionBody');
  const chevron = document.getElementById('rolesChevron');
  const isOpen = !body.classList.contains('hidden');
  body.classList.toggle('hidden', isOpen);
  chevron.style.transform = isOpen ? '' : 'rotate(180deg)';
  if (!isOpen) loadAdminRoles();
});

async function loadAdminRoles() {
  try {
    const res = await fetch(`${ADMIN_SB_URL}/rest/v1/roles?select=name,color,icon&order=created_at.asc`, { headers: ADMIN_SB_HDR });
    adminRoles = res.ok ? await res.json() : [];
    renderRolesList();
    populateRoleModalSelect();
  } catch {
    document.getElementById('rolesList').innerHTML = '<span style="color:#f87171;font-size:0.8rem">Failed to load roles.</span>';
  }
}

function renderRolesList() {
  const el = document.getElementById('rolesList');
  if (!adminRoles.length) {
    el.innerHTML = '<span style="color:rgba(255,255,255,0.3);font-size:0.8rem">No roles created yet.</span>';
    return;
  }
  el.innerHTML = adminRoles.map(r => {
    const rgb = adminHexToRgb(r.color);
    return `<span class="admin-role-chip" style="--rb-rgb:${rgb};--rb-color:${r.color}">
      ${r.icon ? `<span>${r.icon}</span>` : ''}
      <span class="admin-role-chip-name">${escHtml(r.name)}</span>
      <button class="admin-role-chip-del" onclick="deleteRole('${escHtml(r.name)}')" title="Delete role">✕</button>
    </span>`;
  }).join('');
}

function populateRoleModalSelect() {
  const sel = document.getElementById('roleModalSelect');
  if (!sel) return;
  sel.innerHTML = '<option value="">— select role —</option>' +
    adminRoles.map(r => `<option value="${escHtml(r.name)}">${r.icon ? r.icon + ' ' : ''}${escHtml(r.name)}</option>`).join('');
}

// Create role
document.getElementById('createRoleBtn').addEventListener('click', async () => {
  const name  = document.getElementById('newRoleName').value.trim();
  const color = document.getElementById('newRoleColor').value;
  const icon  = document.getElementById('newRoleIcon').value.trim();
  const statusEl = document.getElementById('createRoleStatus');

  if (!name) { showEl(statusEl, '✗ Enter a role name', 'error'); return; }
  document.getElementById('createRoleBtn').disabled = true;
  showEl(statusEl, '⏳ Creating…', 'loading');

  const ok = await callRoleApi({ action: 'create_role', name, color, icon });
  if (ok) {
    showEl(statusEl, `✓ Role "${name.toUpperCase()}" created!`, 'success');
    document.getElementById('newRoleName').value = '';
    document.getElementById('newRoleIcon').value = '';
    toast(`Role "${name.toUpperCase()}" created`, 'success');
    await loadAdminRoles();
  } else {
    showEl(statusEl, '✗ Failed. Role may already exist.', 'error');
  }
  document.getElementById('createRoleBtn').disabled = false;
});

async function deleteRole(name) {
  if (!confirm(`Delete role "${name}"? This removes it from all players.`)) return;
  const ok = await callRoleApi({ action: 'delete_role', name });
  if (ok) {
    toast(`Role "${name}" deleted`, 'success');
    await loadAdminRoles();
  } else {
    toast(`Failed to delete role "${name}"`, 'error');
  }
}

// Role modal
async function openRoleModal(steamid, nickname) {
  roleModalSteamid = steamid;
  document.getElementById('roleModalTitle').textContent = `Roles — ${nickname}`;
  document.getElementById('roleModal').classList.remove('hidden');
  document.getElementById('roleModalStatus').classList.add('hidden');

  // Load available roles if not yet loaded
  if (!adminRoles.length) await loadAdminRoles();
  populateRoleModalSelect();

  // Load current player roles
  await refreshRoleModalCurrent(steamid);
}

async function refreshRoleModalCurrent(steamid) {
  const el = document.getElementById('roleModalCurrent');
  el.innerHTML = '<span style="color:rgba(255,255,255,0.3);font-size:0.8rem">Loading…</span>';
  try {
    const res = await fetch(`${ADMIN_SB_URL}/rest/v1/player_roles?steamid=eq.${steamid}&select=role`, { headers: ADMIN_SB_HDR });
    const rows = res.ok ? await res.json() : [];
    const cfgMap = Object.fromEntries(adminRoles.map(r => [r.name, r]));
    if (!rows.length) {
      el.innerHTML = '<span style="color:rgba(255,255,255,0.3);font-size:0.8rem">No roles assigned.</span>';
      return;
    }
    el.innerHTML = rows.map(({ role }) => {
      const cfg = cfgMap[role] || { color: '#818cf8', icon: '' };
      const rgb = adminHexToRgb(cfg.color);
      return `<span class="admin-role-chip" style="--rb-rgb:${rgb};--rb-color:${cfg.color}">
        ${cfg.icon ? `<span>${cfg.icon}</span>` : ''}
        <span class="admin-role-chip-name">${escHtml(role)}</span>
        <button class="admin-role-chip-del" onclick="removeModalRole('${escHtml(role)}')" title="Remove">✕</button>
      </span>`;
    }).join('');
  } catch {
    el.innerHTML = '<span style="color:#f87171;font-size:0.8rem">Failed to load.</span>';
  }
}

async function removeModalRole(role) {
  const statusEl = document.getElementById('roleModalStatus');
  showEl(statusEl, '⏳ Removing…', 'loading');
  const ok = await callRoleApi({ action: 'remove_role', steamid: roleModalSteamid, role });
  if (ok) {
    showEl(statusEl, `✓ Removed "${role}"`, 'success');
    await refreshRoleModalCurrent(roleModalSteamid);
  } else {
    showEl(statusEl, '✗ Failed', 'error');
  }
}

document.getElementById('roleModalAssignBtn').addEventListener('click', async () => {
  const role = document.getElementById('roleModalSelect').value;
  const statusEl = document.getElementById('roleModalStatus');
  if (!role) { showEl(statusEl, '✗ Select a role first', 'error'); return; }

  showEl(statusEl, '⏳ Assigning…', 'loading');
  const ok = await callRoleApi({ action: 'assign_role', steamid: roleModalSteamid, role });
  if (ok) {
    showEl(statusEl, `✓ "${role}" assigned!`, 'success');
    document.getElementById('roleModalSelect').value = '';
    await refreshRoleModalCurrent(roleModalSteamid);
  } else {
    showEl(statusEl, '✗ Failed', 'error');
  }
});

document.getElementById('roleModalClose').addEventListener('click', () => {
  document.getElementById('roleModal').classList.add('hidden');
  roleModalSteamid = '';
});

document.getElementById('roleModal').addEventListener('click', e => {
  if (e.target === document.getElementById('roleModal')) {
    document.getElementById('roleModal').classList.add('hidden');
  }
});

// ── Bulk update all players ───────────────────────────────────────────────────
const bulkUpdateBtn    = document.getElementById('bulkUpdateBtn');
const bulkUpdateStatus = document.getElementById('bulkUpdateStatus');

if (bulkUpdateBtn) {
  bulkUpdateBtn.addEventListener('click', async () => {
    if (!confirm('Update ALL players in the database?\n\nThis triggers a GitHub Action that scrapes every player (~15 min for 10k players). 0 Edge Function invocations used.')) return;
    bulkUpdateBtn.disabled = true;
    showEl(bulkUpdateStatus, '⏳ Triggering…', 'loading');
    bulkUpdateStatus.classList.remove('hidden');
    const ok = await callAdminApi({ action: 'bulk_update' });
    if (ok) {
      showEl(bulkUpdateStatus, '✓ GitHub Action triggered! Monitor progress in the Actions tab.', 'success');
      toast('Bulk update started — check GitHub Actions for live progress', 'success');
    } else {
      showEl(bulkUpdateStatus, '✗ Failed to trigger', 'error');
    }
    bulkUpdateBtn.disabled = false;
  });
}

async function callRoleApi(body) {
  try {
    const r = await fetch(`${API_BASE}/admin-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, password: adminPassword }),
    });
    if (r.status === 401) { toast('Wrong password — please log out and try again', 'error'); return false; }
    const data = await r.json();
    if (!r.ok) { toast('API error: ' + (data.error || r.status), 'error'); return false; }
    return true;
  } catch (err) {
    toast('Network error: ' + err.message, 'error');
    return false;
  }
}

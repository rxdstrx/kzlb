const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const chromium = require('@sparticuz/chromium');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const steamid = process.argv[2];
let country = (process.argv[3] || 'xx').toLowerCase();
const nickname = process.argv[4] || '';

if (!steamid || !/^\d{17}$/.test(steamid)) {
  console.error('Usage: node add-player.js <steamid64> <country> [nickname]');
  process.exit(1);
}

const FACEIT_KEY = process.env.FACEIT_KEY;
const COOKIE = `multitoken=YoXQFm1ka9utDYaGPCmx9wrHJp1772321827628t9yzf0GAdiUoGv4pjmnJVyhKQk3oYa5q65yHTyVmNYroRvWumE0Km; multitoken_created=1; cookie_read=1; lang_g=ru; current-game=2; vip=true; vip-group=LITE`;

async function getFaceitCountry(sid) {
  if (!FACEIT_KEY) return null;
  try {
    const res = await fetch(`https://open.faceit.com/data/v4/players?game=cs2&game_player_id=${sid}`, {
      headers: { 'Authorization': `Bearer ${FACEIT_KEY}` }
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.country?.toLowerCase() || null;
  } catch { return null; }
}

const cacheDir = path.join(__dirname, '..', 'cache');

function getLeaderboardFile(c) {
  return path.join(cacheDir, `${c}-kz-players.json`);
}

(async () => {
  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: true,
  });

  const page = await browser.newPage();

  const cookies = COOKIE.split('; ').map(c => {
    const [name, ...rest] = c.split('=');
    return { name, value: rest.join('='), domain: 'cybershoke.net' };
  });
  await page.setCookie(...cookies);
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'ru-RU,ru;q=0.9' });

  // If country still unknown, try Faceit lookup automatically
  if (country === 'xx') {
    console.log('Country unknown — trying Faceit lookup...');
    const faceitCountry = await getFaceitCountry(steamid);
    if (faceitCountry) {
      country = faceitCountry;
      console.log(`Found country via Faceit: ${country}`);
    } else {
      console.log('No Faceit account found — player will be added without a flag (xx).');
    }
  }

  console.log('Getting cybershoke session...');
  await page.goto('https://cybershoke.net/', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 2000));

  console.log(`Fetching KZ stats for ${steamid} (country: ${country})...`);

  const { userData, mapsData } = await page.evaluate(async (sid) => {
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/plain, */*',
      'Origin': 'https://cybershoke.net',
      'Referer': `https://cybershoke.net/ru/cs2/leaderboard/kz/maps/${sid}`,
    };
    const body = JSON.stringify({
      mode: 18, season: 0, only_friends: false, only_pro: false,
      id_games: '2', map: null, category: null,
      steamid64: sid, sub_type: 0, type: 1,
    });

    const [uRes, mRes] = await Promise.all([
      fetch('https://cybershoke.net/api/api/v1/leaderboard/user', { method: 'POST', headers, body }),
      fetch('https://cybershoke.net/api/api/v2/leaderboard/data', { method: 'POST', headers, body }),
    ]);

    return {
      userData: await uRes.json().catch(() => ({})),
      mapsData: await mRes.json().catch(() => ({})),
    };
  }, steamid);

  await browser.close();

  const mapList = mapsData?.list || [];
  const desc = mapsData?.header?.desc || {};

  let resolvedNickname = nickname || mapsData?.header?.name || '';
  if (!resolvedNickname) {
    try {
      const steamRes = await fetch(`https://playerdb.co/api/player/steam/${steamid}`);
      const steamData = await steamRes.json();
      resolvedNickname = steamData?.data?.player?.username || steamid;
    } catch {
      resolvedNickname = steamid;
    }
  }

  const player = {
    steamid,
    nickname: resolvedNickname,
    country,
    cached_at: new Date().toISOString(),
    kz_points: desc['{{Points}}'] || 0,
    kz_place: desc['{{Position}}'] || 0,
    kz_maps: desc['{{COMPLETIONS-MAP}}'] || '0',
    avatar: mapsData?.header?.avatar || '',
    maps_list: mapList,
  };

  // Save individual cache file
  fs.writeFileSync(
    path.join(cacheDir, `${steamid}.json`),
    JSON.stringify({ steamid, country, cached_at: new Date().toISOString(), user: userData, maps: mapsData }, null, 2)
  );
  console.log(`Saved cache/${steamid}.json`);

  // Remove player from any OTHER country file they may be in (prevents cross-file dupes)
  const allCountryFiles = fs.readdirSync(cacheDir).filter(f => f.endsWith('-kz-players.json') && f !== 'world-kz-players.json' && f !== `${country}-kz-players.json`);
  for (const cf of allCountryFiles) {
    const cfPath = path.join(cacheDir, cf);
    try {
      const d = JSON.parse(fs.readFileSync(cfPath, 'utf8'));
      const before = d.players.length;
      d.players = d.players.filter(p => p.steamid !== steamid);
      if (d.players.length !== before) {
        fs.writeFileSync(cfPath, JSON.stringify(d, null, 2));
        console.log(`Removed ${steamid} from ${cf}`);
      }
    } catch {}
  }

  // Merge into country leaderboard file
  const lbFile = getLeaderboardFile(country);
  let existing = [];
  if (fs.existsSync(lbFile)) {
    try { existing = JSON.parse(fs.readFileSync(lbFile, 'utf8')).players || []; } catch {}
  }

  const idx = existing.findIndex(p => p.steamid === steamid);
  if (idx !== -1) {
    existing[idx] = player;
    console.log(`Updated existing entry for ${resolvedNickname}`);
  } else {
    existing.push(player);
    console.log(`Added new entry for ${resolvedNickname}`);
  }

  existing.sort((a, b) => b.kz_points - a.kz_points);

  fs.writeFileSync(
    lbFile,
    JSON.stringify({ updated_at: new Date().toISOString(), players: existing }, null, 2)
  );

  // Normalize place_num totals: find max total per map and apply to all country files
  const countryFiles = fs.readdirSync(cacheDir).filter(f => f.endsWith('-kz-players.json') && f !== 'world-kz-players.json');
  const mapMaxTotal = {};
  for (const cf of countryFiles) {
    try {
      const players = JSON.parse(fs.readFileSync(path.join(cacheDir, cf), 'utf8')).players || [];
      for (const p of players) {
        for (const m of (p.maps_list || [])) {
          if (!m.place_num) continue;
          const clean = m.place_num.replace(/[ \s]/g, '');
          const parts = clean.split('/');
          if (parts.length < 2) continue;
          const total = parseInt(parts[1].replace(/\D/g, ''), 10) || 0;
          if (total > (mapMaxTotal[m.map] || 0)) mapMaxTotal[m.map] = total;
        }
      }
    } catch {}
  }
    function fmtNum(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
  for (const cf of countryFiles) {
    const cfPath = path.join(cacheDir, cf);
    try {
      const fileData = JSON.parse(fs.readFileSync(cfPath, 'utf8'));
      let changed = false;
      for (const p of (fileData.players || [])) {
        for (const m of (p.maps_list || [])) {
          const maxTotal = mapMaxTotal[m.map];
          if (!maxTotal || !m.place_num) continue;
          const clean = m.place_num.replace(/[ \s]/g, '');
          const parts = clean.split('/');
          if (parts.length < 2) continue;
          const rank = parseInt(parts[0].replace(/\D/g, ''), 10) || 0;
          const newPlace = `${fmtNum(rank)} / ${fmtNum(maxTotal)}`;
          if (m.place_num !== newPlace) { m.place_num = newPlace; changed = true; }
        }
      }
      if (changed) fs.writeFileSync(cfPath, JSON.stringify(fileData, null, 2));
    } catch {}
  }

  // Rebuild world leaderboard from all country files (never incremental — avoids corruption)
  const worldFile = path.join(cacheDir, 'world-kz-players.json');
  const seen = new Set();
  const worldPlayers = [];
  for (const cf of countryFiles) {
    try {
      const players = JSON.parse(fs.readFileSync(path.join(cacheDir, cf), 'utf8')).players || [];
      for (const p of players) {
        if (!seen.has(p.steamid)) { seen.add(p.steamid); worldPlayers.push(p); }
      }
    } catch {}
  }
  worldPlayers.sort((a, b) => b.kz_points - a.kz_points);
  fs.writeFileSync(worldFile, Buffer.from(JSON.stringify({ updated_at: new Date().toISOString(), players: worldPlayers }, null, 2), 'utf8'));
  console.log(`World rebuilt: ${worldPlayers.length} players`);

  console.log(`Done! ${resolvedNickname} — ${mapList.length} maps, ${player.kz_points} pts, rank #${player.kz_place}`);
})();

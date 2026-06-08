/**
 * scrape-top100.js
 * Fetches top 100 KZ players from Cybershoke leaderboard,
 * scrapes each player's full stats via browser, looks up country via Faceit.
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const chromium = require('@sparticuz/chromium');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const FACEIT_KEY = process.env.FACEIT_KEY;
const COOKIE = `multitoken=YoXQFm1ka9utDYaGPCmx9wrHJp1772321827628t9yzf0GAdiUoGv4pjmnJVyhKQk3oYa5q65yHTyVmNYroRvWumE0Km; multitoken_created=1; cookie_read=1; lang_g=ru; current-game=2; vip=true; vip-group=LITE`;

const cacheDir = path.join(__dirname, '..', 'cache');

function fmtNum(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }

async function getFaceitCountry(steamid) {
  if (!FACEIT_KEY) return 'xx';
  try {
    const res = await fetch(`https://open.faceit.com/data/v4/players?game=cs2&game_player_id=${steamid}`, {
      headers: { 'Authorization': `Bearer ${FACEIT_KEY}` }
    });
    if (!res.ok) return 'xx';
    const data = await res.json();
    return data.country?.toLowerCase() || 'xx';
  } catch { return 'xx'; }
}

(async () => {
  console.log('Launching browser...');
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
  await page.goto('https://cybershoke.net/', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 3000));

  // Step 1: fetch top 100 list via browser
  console.log('Fetching top 100 KZ leaderboard...');
  const topList = await page.evaluate(async () => {
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/plain, */*',
      'Origin': 'https://cybershoke.net',
      'Referer': 'https://cybershoke.net/ru/cs2/leaderboard/kz',
    };
    const res = await fetch('https://cybershoke.net/api/api/v2/leaderboard/data', {
      method: 'POST', headers,
      body: JSON.stringify({ mode: 18, season: 0, only_friends: false, only_pro: false, id_games: '2', map: null, category: null, steamid64: null, sub_type: 0, type: 0 }),
    });
    const data = await res.json().catch(() => ({}));
    return data?.list || [];
  });
  console.log(`Got ${topList.length} players from leaderboard\n`);

  // Step 2: fetch each player's full stats via browser + country via Faceit in parallel
  const results = [];
  for (let i = 0; i < topList.length; i++) {
    const p = topList[i];
    const sid = p.steamid64;
    if (!sid) continue;

    // Fetch KZ stats via browser (reliable, bypasses CF)
    const mapsData = await page.evaluate(async (steamid) => {
      const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/plain, */*',
        'Origin': 'https://cybershoke.net',
        'Referer': `https://cybershoke.net/ru/cs2/leaderboard/kz/maps/${steamid}`,
      };
      const body = JSON.stringify({ mode: 18, season: 0, only_friends: false, only_pro: false, id_games: '2', map: null, category: null, steamid64: steamid, sub_type: 0, type: 1 });
      const res = await fetch('https://cybershoke.net/api/api/v2/leaderboard/data', { method: 'POST', headers, body });
      return res.json().catch(() => ({}));
    }, sid);

    // Fetch country from Faceit in parallel
    const country = await getFaceitCountry(sid);

    const mapList = mapsData?.list || [];
    const desc = mapsData?.header?.desc || {};

    const player = {
      steamid: sid,
      nickname: p.name || sid,
      country,
      cached_at: new Date().toISOString(),
      kz_points: desc['{{Points}}'] || p.points || 0,
      kz_place: desc['{{Position}}'] || p.place || 0,
      kz_maps: desc['{{COMPLETIONS-MAP}}'] || '0',
      avatar: p.avatar || mapsData?.header?.avatar || '',
      maps_list: mapList,
    };

    fs.writeFileSync(path.join(cacheDir, `${sid}.json`), JSON.stringify({
      steamid: sid, country, cached_at: new Date().toISOString(), user: {}, maps: mapsData,
    }, null, 2));

    results.push(player);
    console.log(`[${i+1}/${topList.length}] ${p.name} (${country}) — ${mapList.length} maps, ${player.kz_points} pts`);

    await new Promise(r => setTimeout(r, 200));
  }

  await browser.close();

  // Step 3: remove from all country files, re-add to correct ones
  const allCountryFiles = fs.readdirSync(cacheDir).filter(f => f.endsWith('-kz-players.json') && f !== 'world-kz-players.json');
  const allNewSteamids = new Set(results.map(p => p.steamid));
  for (const cf of allCountryFiles) {
    const cfPath = path.join(cacheDir, cf);
    try {
      const d = JSON.parse(fs.readFileSync(cfPath, 'utf8'));
      const before = d.players.length;
      d.players = d.players.filter(p => !allNewSteamids.has(p.steamid));
      if (d.players.length !== before) fs.writeFileSync(cfPath, Buffer.from(JSON.stringify(d, null, 2), 'utf8'));
    } catch {}
  }

  const byCountry = {};
  for (const player of results) {
    if (!byCountry[player.country]) byCountry[player.country] = [];
    byCountry[player.country].push(player);
  }

  for (const [country, players] of Object.entries(byCountry)) {
    const cfPath = path.join(cacheDir, `${country}-kz-players.json`);
    let existing = [];
    if (fs.existsSync(cfPath)) {
      try { existing = JSON.parse(fs.readFileSync(cfPath, 'utf8')).players || []; } catch {}
    }
    const merged = [...existing, ...players].sort((a, b) => b.kz_points - a.kz_points);
    fs.writeFileSync(cfPath, Buffer.from(JSON.stringify({ updated_at: new Date().toISOString(), players: merged }, null, 2), 'utf8'));
    console.log(`Saved ${players.length} to ${country}-kz-players.json`);
  }

  // Step 4: normalize place totals
  const countryFiles = fs.readdirSync(cacheDir).filter(f => f.endsWith('-kz-players.json') && f !== 'world-kz-players.json');
  const mapMaxTotal = {};
  for (const cf of countryFiles) {
    try {
      const players = JSON.parse(fs.readFileSync(path.join(cacheDir, cf), 'utf8')).players || [];
      for (const p of players) {
        for (const m of (p.maps_list || [])) {
          if (!m.place_num) continue;
          const clean = m.place_num.replace(/[\s ]/g, '');
          const parts = clean.split('/');
          if (parts.length < 2) continue;
          const total = parseInt(parts[1].replace(/\D/g, ''), 10) || 0;
          if (total > (mapMaxTotal[m.map] || 0)) mapMaxTotal[m.map] = total;
        }
      }
    } catch {}
  }
  for (const cf of countryFiles) {
    const cfPath = path.join(cacheDir, cf);
    try {
      const fileData = JSON.parse(fs.readFileSync(cfPath, 'utf8'));
      let changed = false;
      for (const p of (fileData.players || [])) {
        for (const m of (p.maps_list || [])) {
          const maxTotal = mapMaxTotal[m.map];
          if (!maxTotal || !m.place_num) continue;
          const clean = m.place_num.replace(/[\s ]/g, '');
          const parts = clean.split('/');
          if (parts.length < 2) continue;
          const rank = parseInt(parts[0].replace(/\D/g, ''), 10) || 0;
          const newPlace = `${fmtNum(rank)} / ${fmtNum(maxTotal)}`;
          if (m.place_num !== newPlace) { m.place_num = newPlace; changed = true; }
        }
      }
      if (changed) fs.writeFileSync(cfPath, Buffer.from(JSON.stringify(fileData, null, 2), 'utf8'));
    } catch {}
  }

  // Step 5: rebuild world
  const seen = new Set();
  const worldPlayers = [];
  for (const cf of countryFiles) {
    try {
      const ps = JSON.parse(fs.readFileSync(path.join(cacheDir, cf), 'utf8')).players || [];
      for (const p of ps) { if (!seen.has(p.steamid)) { seen.add(p.steamid); worldPlayers.push(p); } }
    } catch {}
  }
  worldPlayers.sort((a, b) => b.kz_points - a.kz_points);
  fs.writeFileSync(path.join(cacheDir, 'world-kz-players.json'), Buffer.from(JSON.stringify({ updated_at: new Date().toISOString(), players: worldPlayers }, null, 2), 'utf8'));

  console.log(`\n✓ Done! ${results.length} players saved | world: ${worldPlayers.length} total`);
})();

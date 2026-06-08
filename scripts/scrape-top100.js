/**
 * scrape-top100.js
 * Fetches top 100 KZ players from Cybershoke, looks up their country via Faceit,
 * saves to correct country files and rebuilds world.
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const chromium = require('@sparticuz/chromium');
const fs = require('fs');
const path = require('path');
const https = require('https');

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

function fetchKzStats(steamid, cookieHeader) {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      mode: 18, season: 0, only_friends: false, only_pro: false,
      id_games: '2', map: null, category: null,
      steamid64: steamid, sub_type: 0, type: 1,
    });
    const req = https.request({
      hostname: 'cybershoke.net',
      path: '/api/api/v2/leaderboard/data',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/plain, */*',
        'Origin': 'https://cybershoke.net',
        'Referer': `https://cybershoke.net/ru/cs2/leaderboard/kz/maps/${steamid}`,
        'Cookie': cookieHeader,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({}); } });
    });
    req.on('error', () => resolve({}));
    req.setTimeout(20000, () => { req.destroy(); resolve({}); });
    req.write(body); req.end();
  });
}

(async () => {
  // Step 1: launch browser, get CF session + top 100 list
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

  // Fetch top 100 list only (no individual stats yet)
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

  // Get CF cookies for direct HTTPS requests
  const allCookies = await page.cookies('https://cybershoke.net');
  await browser.close();
  const cookieHeader = allCookies.map(c => `${c.name}=${c.value}`).join('; ');
  console.log(`Got ${topList.length} players. Fetching their full stats + countries in parallel...`);

  // Step 2: fetch individual stats (10 at a time) + country via Faceit in parallel
  const results = [];
  for (let i = 0; i < topList.length; i += 10) {
    const batch = topList.slice(i, i + 10);
    const batchResults = await Promise.all(batch.map(async (p) => {
      const [mapsData, country] = await Promise.all([
        fetchKzStats(p.steamid64, cookieHeader),
        getFaceitCountry(p.steamid64),
      ]);
      return { p, mapsData, country };
    }));
    results.push(...batchResults);
    for (const { p, country } of batchResults) {
      console.log(`  [#${p.place}] ${p.name} → ${country}`);
    }
    if (i + 10 < topList.length) await new Promise(r => setTimeout(r, 400));
  }

  // Step 3: build player objects
  const byCountry = {};
  for (const { p, mapsData, country } of results) {
    const sid = p.steamid64;
    if (!sid) continue;
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

    console.log(`  ${p.name} (${country}) — ${mapList.length} maps, ${player.kz_points} pts`);

    if (!byCountry[country]) byCountry[country] = [];
    byCountry[country].push(player);
  }

  // Step 4: remove these players from all country files, then re-add to correct ones
  const allCountryFiles = fs.readdirSync(cacheDir).filter(f => f.endsWith('-kz-players.json') && f !== 'world-kz-players.json');
  const allNewSteamids = new Set(results.map(r => r.p.steamid64).filter(Boolean));
  for (const cf of allCountryFiles) {
    const cfPath = path.join(cacheDir, cf);
    try {
      const d = JSON.parse(fs.readFileSync(cfPath, 'utf8'));
      const before = d.players.length;
      d.players = d.players.filter(p => !allNewSteamids.has(p.steamid));
      if (d.players.length !== before) fs.writeFileSync(cfPath, Buffer.from(JSON.stringify(d, null, 2), 'utf8'));
    } catch {}
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

  // Step 5: normalize place totals
  const countryFiles = fs.readdirSync(cacheDir).filter(f => f.endsWith('-kz-players.json') && f !== 'world-kz-players.json');
  const mapMaxTotal = {};
  for (const cf of countryFiles) {
    try {
      const players = JSON.parse(fs.readFileSync(path.join(cacheDir, cf), 'utf8')).players || [];
      for (const p of players) {
        for (const m of (p.maps_list || [])) {
          if (!m.place_num) continue;
          const clean = m.place_num.replace(/[\s ]/g, '');
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
          const clean = m.place_num.replace(/[\s ]/g, '');
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

  // Step 6: rebuild world
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

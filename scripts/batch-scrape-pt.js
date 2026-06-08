const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const chromium = require('@sparticuz/chromium');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const COOKIE = `multitoken=YoXQFm1ka9utDYaGPCmx9wrHJp1772321827628t9yzf0GAdiUoGv4pjmnJVyhKQk3oYa5q65yHTyVmNYroRvWumE0Km; multitoken_created=1; cookie_read=1; lang_g=ru; current-game=2; vip=true; vip-group=LITE`;

const cacheDir = path.join(__dirname, '..', 'cache');
const ptFile   = path.join(cacheDir, 'pt-players.json');

if (!fs.existsSync(ptFile)) { console.error('pt-players.json not found'); process.exit(1); }

const { players: allPlayers } = JSON.parse(fs.readFileSync(ptFile, 'utf8'));

// Load existing KZ players so we don't re-scrape them
const ptKzFile = path.join(cacheDir, 'pt-kz-players.json');
let existingKz = [];
if (fs.existsSync(ptKzFile)) {
  try { existingKz = JSON.parse(fs.readFileSync(ptKzFile, 'utf8')).players || []; } catch {}
}
const alreadyScraped = new Set(existingKz.map(p => p.steamid));

// Also skip players that have an individual cache file (already scanned, no KZ data)
// unless they're being re-scraped by force
allPlayers.forEach(p => {
  if (fs.existsSync(path.join(cacheDir, `${p.steamid64}.json`))) {
    alreadyScraped.add(p.steamid64);
  }
});

// Filter to only players we haven't scanned yet
const players = allPlayers.filter(p => !alreadyScraped.has(p.steamid64));
console.log(`Total in pt-players.json: ${allPlayers.length}`);
console.log(`Already scanned: ${alreadyScraped.size}`);
console.log(`To scrape: ${players.length}`);

if (!players.length) { console.log('Nothing to scrape.'); process.exit(0); }

async function fetchPlayerStats(page, steamid) {
  const body = JSON.stringify({
    mode: 18, season: 0, only_friends: false, only_pro: false,
    id_games: '2', map: null, category: null,
    steamid64: steamid, sub_type: 0, type: 1,
  });
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/plain, */*',
    'Origin': 'https://cybershoke.net',
    'Referer': `https://cybershoke.net/ru/cs2/leaderboard/kz/maps/${steamid}`,
  };
  const [userRes, mapsRes] = await page.evaluate(async (steamid, headers, body) => {
    const [u, m] = await Promise.all([
      fetch('https://cybershoke.net/api/api/v1/leaderboard/user', { method: 'POST', headers, body }),
      fetch('https://cybershoke.net/api/api/v2/leaderboard/data', { method: 'POST', headers, body }),
    ]);
    return [await u.json().catch(() => ({})), await m.json().catch(() => ({}))];
  }, steamid, headers, body);
  return { user: userRes, maps: mapsRes };
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

  console.log('Getting cybershoke session...');
  await page.goto('https://cybershoke.net/', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 2000));
  console.log('Session ready. Starting batch scrape...');

  const kzPlayers = [];
  let withKZ = 0;
  let withoutKZ = 0;

  for (let i = 0; i < players.length; i++) {
    const player = players[i];
    const { steamid64, nickname, faceit_elo, skill_level } = player;

    try {
      const { maps } = await fetchPlayerStats(page, steamid64);
      const mapList = maps?.list || [];
      const desc = maps?.header?.desc || {};

      // Save individual cache file (marks as scanned even if no KZ data)
      fs.writeFileSync(path.join(cacheDir, `${steamid64}.json`), JSON.stringify({
        steamid: steamid64, country: 'pt', cached_at: new Date().toISOString(),
        user: {}, maps,
      }, null, 2));

      if (mapList.length > 0) {
        withKZ++;
        const result = {
          steamid: steamid64,
          nickname,
          faceit_elo,
          skill_level,
          country: 'pt',
          cached_at: new Date().toISOString(),
          kz_points: desc['{{Points}}'] || 0,
          kz_place: desc['{{Position}}'] || 0,
          kz_maps: desc['{{COMPLETIONS-MAP}}'] || '0',
          avatar: maps?.header?.avatar || '',
          maps_list: mapList,
        };
        kzPlayers.push(result);
        console.log(`[${i+1}/${players.length}] ✓ ${nickname} — ${mapList.length} maps, ${result.kz_points} pts`);
      } else {
        withoutKZ++;
        console.log(`[${i+1}/${players.length}] ✗ ${nickname} — no KZ data`);
      }
    } catch (e) {
      console.log(`[${i+1}/${players.length}] ERROR ${nickname}: ${e.message}`);
    }

    await new Promise(r => setTimeout(r, 300));
  }

  await browser.close();

  // Merge with existing pt-kz-players.json (no dupes)
  const existingIds = new Set(existingKz.map(p => p.steamid));
  const merged = [...existingKz, ...kzPlayers.filter(p => !existingIds.has(p.steamid))];
  merged.sort((a, b) => b.kz_points - a.kz_points);

  fs.writeFileSync(ptKzFile, Buffer.from(JSON.stringify({ updated_at: new Date().toISOString(), players: merged }, null, 2), 'utf8'));

  // Rebuild world
  const worldFile = path.join(cacheDir, 'world-kz-players.json');
  const countryFiles = fs.readdirSync(cacheDir).filter(f => f.endsWith('-kz-players.json') && f !== 'world-kz-players.json');
  const seen = new Set();
  const worldPlayers = [];
  for (const cf of countryFiles) {
    try {
      const ps = JSON.parse(fs.readFileSync(path.join(cacheDir, cf), 'utf8')).players || [];
      for (const p of ps) { if (!seen.has(p.steamid)) { seen.add(p.steamid); worldPlayers.push(p); } }
    } catch {}
  }
  worldPlayers.sort((a, b) => b.kz_points - a.kz_points);
  fs.writeFileSync(worldFile, Buffer.from(JSON.stringify({ updated_at: new Date().toISOString(), players: worldPlayers }, null, 2), 'utf8'));

  console.log(`\nDone! ${withKZ} new KZ players, ${withoutKZ} without KZ.`);
  console.log(`pt-kz-players.json: ${merged.length} total | world: ${worldPlayers.length} total`);
})();

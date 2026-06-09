/**
 * scan-new-pt.js
 * Fetches NEW Portuguese players from Faceit starting where pt-players.json left off,
 * scrapes their KZ stats, and saves everything. Skips already-known players.
 *
 * Usage: node scan-new-pt.js [howMany]
 * e.g.  node scan-new-pt.js 100   → fetch & scrape next 100 players
 *        node scan-new-pt.js 5000  → fetch & scrape next 5000 players
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const chromium = require('@sparticuz/chromium');
const fs = require('fs');
const path = require('path');
const https = require('https');

puppeteer.use(StealthPlugin());

const FACEIT_KEY = process.env.FACEIT_KEY;
const HOW_MANY   = parseInt(process.argv[2] || '100', 10);
const CONCURRENCY = 10;
const COOKIE = process.env.CYBERSHOKE_COOKIE;

const cacheDir = path.join(__dirname, '..', 'cache');
const ptFile   = path.join(cacheDir, 'pt-players.json');
const ptKzFile = path.join(cacheDir, 'pt-kz-players.json');

// Load existing pt-players.json
let existingPlayers = [];
if (fs.existsSync(ptFile)) {
  try { existingPlayers = JSON.parse(fs.readFileSync(ptFile, 'utf8')).players || []; } catch {}
}
const knownSteamids = new Set(existingPlayers.map(p => p.steamid64));

// Auto-detect start offset from how many we already have
// Round down to nearest 100 to avoid gaps
const startOffset = Math.floor(existingPlayers.length / 100) * 100;
const endOffset   = startOffset + HOW_MANY;

console.log(`Existing pt-players.json: ${existingPlayers.length} players`);
console.log(`Starting Faceit fetch from offset ${startOffset} → ${endOffset} (${HOW_MANY} new players)\n`);

// ── FACEIT FETCH ──────────────────────────────────────────────────────────────
async function fetchPage(offset) {
  const res = await fetch(
    `https://open.faceit.com/data/v4/rankings/games/cs2/regions/EU?country=pt&limit=100&offset=${offset}`,
    { headers: { 'Authorization': `Bearer ${FACEIT_KEY}` } }
  );
  if (!res.ok) { console.log(`Faceit offset ${offset}: HTTP ${res.status}`); return []; }
  const data = await res.json();
  return data.items || [];
}

async function getSteamId(playerId) {
  const res = await fetch(
    `https://open.faceit.com/data/v4/players/${playerId}`,
    { headers: { 'Authorization': `Bearer ${FACEIT_KEY}` } }
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data.steam_id_64 || null;
}

async function fetchNewPlayers() {
  const newPlayers = [];
  for (let offset = startOffset; offset < endOffset; offset += 100) {
    const items = await fetchPage(offset);
    if (!items.length) { console.log(`No more players at offset ${offset}`); break; }
    console.log(`Faceit offset ${offset}: ${items.length} players — resolving steamids...`);

    for (let i = 0; i < items.length; i += 10) {
      const batch = items.slice(i, i + 10);
      const resolved = await Promise.all(batch.map(async item => ({
        item, steamid: await getSteamId(item.player_id)
      })));
      for (const { item, steamid } of resolved) {
        if (!steamid) continue;
        if (knownSteamids.has(steamid)) { console.log(`  SKIP ${item.nickname}`); continue; }
        newPlayers.push({
          faceit_id: item.player_id, nickname: item.nickname,
          faceit_elo: item.faceit_elo, skill_level: item.skill_level,
          steamid64: steamid, country: 'pt',
        });
        knownSteamids.add(steamid);
        console.log(`  + ${item.nickname} → ${steamid}`);
      }
      if (i + 10 < items.length) await new Promise(r => setTimeout(r, 150));
    }
    if (items.length < 100) break;
  }
  return newPlayers;
}

// ── CYBERSHOKE SCRAPE ─────────────────────────────────────────────────────────
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
    req.setTimeout(15000, () => { req.destroy(); resolve({}); });
    req.write(body); req.end();
  });
}

async function scrapePlayer(player, cookieHeader, idx, total) {
  const { steamid64, nickname, faceit_elo, skill_level } = player;
  try {
    const maps = await fetchKzStats(steamid64, cookieHeader);
    const mapList = maps?.list || [];
    const desc = maps?.header?.desc || {};

    // Save individual cache file
    fs.writeFileSync(path.join(cacheDir, `${steamid64}.json`), JSON.stringify({
      steamid: steamid64, country: 'pt', cached_at: new Date().toISOString(), user: {}, maps,
    }, null, 2));

    if (mapList.length > 0) {
      console.log(`[${idx}/${total}] ✓ ${nickname} — ${mapList.length} maps, ${desc['{{Points}}'] || 0} pts`);
      return {
        steamid: steamid64, nickname, faceit_elo, skill_level, country: 'pt',
        cached_at: new Date().toISOString(),
        kz_points: desc['{{Points}}'] || 0,
        kz_place: desc['{{Position}}'] || 0,
        kz_maps: desc['{{COMPLETIONS-MAP}}'] || '0',
        avatar: maps?.header?.avatar || '',
        maps_list: mapList,
      };
    } else {
      console.log(`[${idx}/${total}] ✗ ${nickname} — no KZ`);
      return null;
    }
  } catch (e) {
    console.log(`[${idx}/${total}] ERROR ${nickname}: ${e.message}`);
    return null;
  }
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
(async () => {
  // Step 1: fetch new players from Faceit
  const newPlayers = await fetchNewPlayers();
  console.log(`\nFetched ${newPlayers.length} new players from Faceit.`);

  if (!newPlayers.length) {
    console.log('No new players to scrape.');
    process.exit(0);
  }

  // Save updated pt-players.json
  const allPlayers = [...existingPlayers, ...newPlayers];
  fs.writeFileSync(ptFile, JSON.stringify({ updated_at: new Date().toISOString(), players: allPlayers }, null, 2));
  console.log(`pt-players.json updated: ${allPlayers.length} total\n`);

  // Step 2: get Cloudflare session via browser (once)
  console.log('Launching browser for Cloudflare session...');
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
  const allCookies = await page.cookies('https://cybershoke.net');
  await browser.close();
  const cookieHeader = allCookies.map(c => `${c.name}=${c.value}`).join('; ');
  console.log(`Got ${allCookies.length} cookies. Scraping ${newPlayers.length} players (${CONCURRENCY} concurrent)...\n`);

  // Step 3: scrape ONLY the new players in parallel batches
  const kzPlayers = [];
  let withKZ = 0, withoutKZ = 0;

  for (let i = 0; i < newPlayers.length; i += CONCURRENCY) {
    const batch = newPlayers.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map((p, j) => scrapePlayer(p, cookieHeader, i + j + 1, newPlayers.length)));
    for (const r of results) {
      if (r) { kzPlayers.push(r); withKZ++; } else { withoutKZ++; }
    }
    if (i + CONCURRENCY < newPlayers.length) await new Promise(r => setTimeout(r, 400));
  }

  // Step 4: merge into pt-kz-players.json
  let existingKz = [];
  if (fs.existsSync(ptKzFile)) {
    try { existingKz = JSON.parse(fs.readFileSync(ptKzFile, 'utf8')).players || []; } catch {}
  }
  const existingIds = new Set(existingKz.map(p => p.steamid));
  const merged = [...existingKz, ...kzPlayers.filter(p => !existingIds.has(p.steamid))];
  merged.sort((a, b) => b.kz_points - a.kz_points);
  fs.writeFileSync(ptKzFile, Buffer.from(JSON.stringify({ updated_at: new Date().toISOString(), players: merged }, null, 2), 'utf8'));

  // Step 5: rebuild world
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

  console.log(`\n✓ Done! ${withKZ} new KZ players found, ${withoutKZ} without KZ.`);
  console.log(`pt-kz-players.json: ${merged.length} | world: ${worldPlayers.length}`);
})();

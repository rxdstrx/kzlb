const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const chromium = require('@sparticuz/chromium');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const steamid = process.argv[2];
const nickname = process.argv[3] || '';

if (!steamid || !/^\d{17}$/.test(steamid)) {
  console.error('Usage: node add-pt-player.js <steamid64> [nickname]');
  process.exit(1);
}

const COOKIE = process.env.CYBERSHOKE_COOKIE;

const cacheDir = path.join(__dirname, '..', 'cache');
const ptKzFile = path.join(cacheDir, 'pt-kz-players.json');

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

  console.log('Getting cybershoke session...');
  await page.goto('https://cybershoke.net/', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 2000));

  console.log(`Fetching KZ stats for ${steamid}...`);

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
  if (mapList.length === 0) {
    console.error('No KZ data found for this player. They may not have any KZ completions.');
    process.exit(1);
  }

  const desc = mapsData?.header?.desc || {};
  const resolvedNickname = nickname || mapsData?.header?.name || steamid;

  const player = {
    steamid,
    nickname: resolvedNickname,
    country: 'pt',
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
    JSON.stringify({ steamid, cached_at: new Date().toISOString(), user: userData, maps: mapsData }, null, 2)
  );
  console.log(`Saved cache/${steamid}.json`);

  // Merge into pt-kz-players.json
  let existing = [];
  if (fs.existsSync(ptKzFile)) {
    try { existing = JSON.parse(fs.readFileSync(ptKzFile, 'utf8')).players || []; } catch {}
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
    ptKzFile,
    JSON.stringify({ updated_at: new Date().toISOString(), players: existing }, null, 2)
  );

  console.log(`Done! ${resolvedNickname} — ${mapList.length} maps, ${player.kz_points} pts, rank #${player.kz_place}`);
})();

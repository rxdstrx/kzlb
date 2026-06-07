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

const { players } = JSON.parse(fs.readFileSync(ptFile, 'utf8'));
console.log(`Loaded ${players.length} Portuguese players`);

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

  // Set cookies
  const cookies = COOKIE.split('; ').map(c => {
    const [name, ...rest] = c.split('=');
    return { name, value: rest.join('='), domain: 'cybershoke.net' };
  });
  await page.setCookie(...cookies);

  // Navigate once to get cf_clearance
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
      const { user, maps } = await fetchPlayerStats(page, steamid64);
      const mapList = maps?.list || [];
      const kzUser  = user?.['18'] || {};

      if (mapList.length > 0) {
        withKZ++;
        const desc = maps?.header?.desc || {};
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

        // Save individual cache file
        fs.writeFileSync(path.join(cacheDir, `${steamid64}.json`), JSON.stringify({
          steamid: steamid64,
          cached_at: new Date().toISOString(),
          user: {},
          maps,
        }, null, 2));

        kzPlayers.push(result);
        console.log(`[${i+1}/${players.length}] ✓ ${nickname} — ${mapList.length} maps, ${kzUser.points || 0} pts`);
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

  // Sort by KZ points descending
  kzPlayers.sort((a, b) => b.kz_points - a.kz_points);

  fs.writeFileSync(
    path.join(cacheDir, 'pt-kz-players.json'),
    JSON.stringify({ updated_at: new Date().toISOString(), players: kzPlayers }, null, 2)
  );

  console.log(`\nDone! ${withKZ} players with KZ data, ${withoutKZ} without.`);
  console.log(`Saved to cache/pt-kz-players.json`);
})();

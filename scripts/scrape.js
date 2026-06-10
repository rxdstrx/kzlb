const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const chromium = require('@sparticuz/chromium');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const steamid = process.argv[2];
if (!steamid || !/^\d{17}$/.test(steamid)) {
  console.error('Invalid steamid');
  process.exit(1);
}

const COOKIE = process.env.CYBERSHOKE_COOKIE;
if (!COOKIE) {
  console.error('CYBERSHOKE_COOKIE env var is not set — aborting');
  process.exit(1);
}

(async () => {
  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: true,
  });

  const page = await browser.newPage();

  // Set cookies before navigation
  const cookies = COOKIE.split('; ').map(c => {
    const [name, ...rest] = c.split('=');
    return { name, value: rest.join('='), domain: 'cybershoke.net' };
  });
  await page.setCookie(...cookies);

  await page.setExtraHTTPHeaders({ 'Accept-Language': 'ru-RU,ru;q=0.9' });

  console.log('Navigating to cybershoke...');

  try {
    await page.goto('https://cybershoke.net/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
  } catch (e) {
    console.log('Navigation note:', e.message);
  }

  await new Promise(r => setTimeout(r, 1500));
  console.log('Page title:', await page.title());

  // Make API calls directly from within the page context using correct steamid
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

  console.log('User keys:', Object.keys(userData));
  console.log('Maps list count:', mapsData?.list?.length ?? 'no list');

  await browser.close();

  // NOTE: userData (/api/v1/leaderboard/user) always returns the authenticated
  // cookie-owner's stats, NOT the queried player's stats. We deliberately do
  // not persist it to avoid contaminating other players' cache files.
  // All KZ stats are sourced from mapsData (/api/v2/leaderboard/data) which
  // correctly filters by steamid64.
    // Normalize place_num: fix double-UTF-8 non-breaking space encoding
  if (mapsData && mapsData.list) {
    mapsData.list = mapsData.list.map(function(entry) {
      var pos = (entry.place_num || '');
      // Replace double-encoded NBSP (\u00c2\u00a0) then plain NBSP (\u00a0)
      pos = pos.replace(/\u00c2\u00a0/g, ' ').replace(/\u00a0/g, ' ').trim();
      return Object.assign({}, entry, { place_num: pos });
    });
  }
  const result = {
    steamid,
    cached_at: new Date().toISOString(),
    user: {},
    maps: mapsData,
  };

  const cacheDir = path.join(__dirname, '..', 'cache');
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir);
  fs.writeFileSync(path.join(cacheDir, `${steamid}.json`), JSON.stringify(result, null, 2));

  console.log('Done. Saved to cache/' + steamid + '.json');
})();

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

const COOKIE = `multitoken=YoXQFm1ka9utDYaGPCmx9wrHJp1772321827628t9yzf0GAdiUoGv4pjmnJVyhKQk3oYa5q65yHTyVmNYroRvWumE0Km; multitoken_created=1; cookie_read=1; lang_g=ru; current-game=2; vip=true; vip-group=LITE`;

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

  await page.setExtraHTTPHeaders({
    'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
  });

  console.log(`Navigating to cybershoke page for ${steamid}...`);
  await page.goto(`https://cybershoke.net/ru/cs2/leaderboard/kz/maps/${steamid}`, {
    waitUntil: 'networkidle2',
    timeout: 60000,
  });

  // Intercept API responses
  let userData = {};
  let mapsData = [];

  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('/api/api/v1/leaderboard/user')) {
      try { userData = await response.json(); } catch {}
    }
    if (url.includes('/api/api/v2/leaderboard/data')) {
      try { mapsData = await response.json(); } catch {}
    }
  });

  // Wait for the data to load
  await new Promise(r => setTimeout(r, 8000));

  await browser.close();

  const result = { steamid, cached_at: new Date().toISOString(), user: userData, maps: mapsData };

  const cacheDir = path.join(__dirname, '..', 'cache');
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir);
  fs.writeFileSync(path.join(cacheDir, `${steamid}.json`), JSON.stringify(result, null, 2));

  console.log(`Saved cache/${steamid}.json — user keys: ${Object.keys(userData).join(', ')}, maps count: ${Array.isArray(mapsData) ? mapsData.length : 'N/A'}`);
})();

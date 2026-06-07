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

  // Set cookies before navigation
  const cookies = COOKIE.split('; ').map(c => {
    const [name, ...rest] = c.split('=');
    return { name, value: rest.join('='), domain: 'cybershoke.net' };
  });
  await page.setCookie(...cookies);

  await page.setExtraHTTPHeaders({ 'Accept-Language': 'ru-RU,ru;q=0.9' });

  // Set up interceptors BEFORE navigation
  let userData = {};
  let mapsData = [];

  page.on('response', async (response) => {
    const url = response.url();
    try {
      if (url.includes('/api/api/v1/leaderboard/user')) {
        const json = await response.json();
        userData = json;
        console.log('Got user data:', JSON.stringify(json).slice(0, 200));
      }
      if (url.includes('/api/api/v2/leaderboard/data')) {
        const json = await response.json();
        mapsData = json;
        console.log('Got maps data raw:', JSON.stringify(json).slice(0, 500));
      }
    } catch (e) {
      console.log('Response parse error for', url, e.message);
    }
  });

  console.log(`Navigating to cybershoke page for ${steamid}...`);

  try {
    await page.goto(`https://cybershoke.net/ru/cs2/leaderboard/kz/maps/${steamid}`, {
      waitUntil: 'networkidle0',
      timeout: 60000,
    });
  } catch (e) {
    console.log('Navigation note:', e.message);
  }

  // Wait for initial load
  await new Promise(r => setTimeout(r, 5000));

  // Click the "Карты" tab to trigger maps API call
  try {
    await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('button, a, div[role="tab"], span'));
      const mapsTab = tabs.find(el => el.textContent.trim().includes('арт') || el.textContent.trim().includes('Map'));
      if (mapsTab) { mapsTab.click(); console.log('Clicked maps tab:', mapsTab.textContent); }
      else console.log('Maps tab not found, available tabs:', tabs.map(t => t.textContent.trim()).filter(t => t.length < 30).join(' | '));
    });
  } catch (e) {
    console.log('Tab click error:', e.message);
  }

  // Wait for maps data to load
  await new Promise(r => setTimeout(r, 8000));

  console.log('Page title:', await page.title());
  console.log('User data keys:', Object.keys(userData));
  console.log('Maps count:', Array.isArray(mapsData) ? mapsData.length : 'not array');

  await browser.close();

  const result = {
    steamid,
    cached_at: new Date().toISOString(),
    user: userData,
    maps: mapsData,
  };

  const cacheDir = path.join(__dirname, '..', 'cache');
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir);
  fs.writeFileSync(path.join(cacheDir, `${steamid}.json`), JSON.stringify(result, null, 2));

  console.log('Done. Saved to cache/' + steamid + '.json');
})();

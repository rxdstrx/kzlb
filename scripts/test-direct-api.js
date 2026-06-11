// Test: can we call Cybershoke API directly without Puppeteer?
// Usage: node scripts/test-direct-api.js <steamid>
// Needs CYBERSHOKE_COOKIE env var

const steamid = process.argv[2] || '76561198842886915';
const COOKIE = process.env.CYBERSHOKE_COOKIE;

if (!COOKIE) {
  console.error('Set CYBERSHOKE_COOKIE env var');
  process.exit(1);
}

const headers = {
  'Content-Type': 'application/json',
  'Accept': 'application/json, text/plain, */*',
  'Origin': 'https://cybershoke.net',
  'Referer': `https://cybershoke.net/ru/cs2/leaderboard/kz/maps/${steamid}`,
  'Cookie': COOKIE,
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'ru-RU,ru;q=0.9',
};

const body = JSON.stringify({
  mode: 18, season: 0, only_friends: false, only_pro: false,
  id_games: '2', map: null, category: null,
  steamid64: steamid, sub_type: 0, type: 1,
});

console.log(`Testing direct API call for steamid: ${steamid}`);
console.log('No Puppeteer — just raw fetch with cookie...\n');

(async () => {
  try {
    const start = Date.now();
    const res = await fetch('https://cybershoke.net/api/api/v2/leaderboard/data', {
      method: 'POST', headers, body,
    });
    const elapsed = Date.now() - start;

    console.log(`Status: ${res.status} (${elapsed}ms)`);

    if (!res.ok) {
      const text = await res.text();
      console.log('Response body:', text.slice(0, 500));
      console.log('\n❌ Direct API failed — Cloudflare is blocking it');
      return;
    }

    const data = await res.json();
    const mapList = data?.list || [];
    const desc = data?.header?.desc || {};
    const points = desc['{{Points}}'];
    const rank = desc['{{Position}}'];
    const maps = desc['{{COMPLETIONS-MAP}}'];

    if (mapList.length > 0 || points) {
      console.log(`\n✅ SUCCESS — No Puppeteer needed!`);
      console.log(`Player: ${data?.header?.name}`);
      console.log(`Points: ${points}, Rank: ${rank}, Maps: ${maps}`);
      console.log(`Map records: ${mapList.length}`);
      console.log(`\nThis means scraping can be done in ~2 seconds instead of 2 minutes!`);
    } else {
      console.log('Response:', JSON.stringify(data).slice(0, 300));
      console.log('\n⚠️  Got response but no data — cookie may be invalid or CF challenge needed');
    }
  } catch (e) {
    console.error('❌ Error:', e.message);
  }
})();

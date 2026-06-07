const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const CORS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

async function fetchCybershoke(steamid) {
  const res = await fetch('https://cybershoke.net/api/api/v2/leaderboard/data', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/plain, */*',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Origin': 'https://cybershoke.net',
      'Referer': `https://cybershoke.net/ru/cs2/leaderboard/kz/maps/${steamid}`,
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
    },
    body: JSON.stringify({
      mode: 18, season: 0, only_friends: false, only_pro: false,
      id_games: "2", map: null, category: null,
      steamid64: steamid, sub_type: 0, type: 1,
    }),
  });

  return { status: res.status, text: await res.text() };
}

exports.handler = async (event) => {
  const steamid = event.queryStringParameters?.steamid;

  if (!steamid || !/^\d{17}$/.test(steamid)) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid steamid' }) };
  }

  const MAX_RETRIES = 5;
  const DELAYS = [0, 2000, 4000, 6000, 8000]; // up to ~20s total, within 26s limit

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) await sleep(DELAYS[attempt]);

    try {
      const { status, text } = await fetchCybershoke(steamid);

      if (status === 429) {
        // Rate limited — retry after delay
        console.log(`Attempt ${attempt + 1}: 429 rate limited, retrying...`);
        continue;
      }

      if (!status.toString().startsWith('2')) {
        return {
          statusCode: 502, headers: CORS,
          body: JSON.stringify({ error: `Cybershoke returned ${status}`, attempt: attempt + 1 }),
        };
      }

      // Success
      return {
        statusCode: 200,
        headers: { ...CORS, 'Cache-Control': 'public, s-maxage=300' },
        body: text,
      };

    } catch (e) {
      console.log(`Attempt ${attempt + 1} error: ${e.message}`);
      if (attempt === MAX_RETRIES - 1) {
        return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) };
      }
    }
  }

  return {
    statusCode: 429, headers: CORS,
    body: JSON.stringify({ error: 'Cybershoke is rate limiting us. Please try again in a minute.' }),
  };
};

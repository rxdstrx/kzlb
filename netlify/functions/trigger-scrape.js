exports.handler = async (event) => {
  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }

  const steamid = event.queryStringParameters?.steamid;
  if (!steamid || !/^\d{17}$/.test(steamid)) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid steamid' }) };
  }

  const token = process.env.GH_TOKEN;
  if (!token) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'No token configured' }) };
  }

  const res = await fetch('https://api.github.com/repos/rxdstrx/kzlb/actions/workflows/scrape-kz.yml/dispatches', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ref: 'main', inputs: { steamid } }),
  });

  if (res.status === 204) {
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true }) };
  }

  const text = await res.text();
  return { statusCode: res.status, headers: CORS, body: JSON.stringify({ error: text }) };
};

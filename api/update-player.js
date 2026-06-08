export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { steamid } = req.query;
  if (!steamid || !/^\d{17}$/.test(steamid)) {
    return res.status(400).json({ error: 'Invalid steamid' });
  }

  const token = process.env.GH_TOKEN;
  if (!token) return res.status(500).json({ error: 'No token configured' });

  // Look up existing country from player cache
  let country = 'xx';
  let playerFound = false;
  try {
    const cacheRes = await fetch(`https://raw.githubusercontent.com/rxdstrx/kzlb/main/cache/${steamid}.json`);
    if (cacheRes.ok) {
      playerFound = true;
      const data = await cacheRes.json();
      if (data.country) country = data.country;
    }
  } catch {}

  if (!playerFound) {
    return res.status(404).json({ error: 'Player not found in leaderboard. Use "Add to the leaderboard" first.' });
  }

  const response = await fetch(
    'https://api.github.com/repos/rxdstrx/kzlb/actions/workflows/add-player.yml/dispatches',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main', inputs: { steamid, country, nickname: '' } }),
    }
  );

  if (response.status === 204) return res.status(200).json({ ok: true });
  const text = await response.text();
  return res.status(response.status).json({ error: text });
}

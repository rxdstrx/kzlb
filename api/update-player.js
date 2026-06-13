const ALLOWED_ORIGINS = ['https://rxdstrx.github.io', 'https://kzlb.vercel.app'];

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!ALLOWED_ORIGINS.includes(origin)) return res.status(403).json({ error: 'Forbidden' });

  const { steamid } = req.query;
  if (!steamid || !/^\d{17}$/.test(steamid)) {
    return res.status(400).json({ error: 'Invalid steamid' });
  }

  const token = process.env.GH_TOKEN;
  if (!token) return res.status(500).json({ error: 'No token configured' });

  // Cooldown: 1 hour per steamid
  const sbUrl = process.env.SUPABASE_URL;
  const sbKey = process.env.SUPABASE_SERVICE_KEY;
  if (sbUrl && sbKey) {
    try {
      const r = await fetch(`${sbUrl}/rest/v1/players?steamid=eq.${steamid}&select=updated_at&limit=1`, {
        headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` },
      });
      if (r.ok) {
        const rows = await r.json();
        if (rows[0]?.updated_at) {
          const minsAgo = (Date.now() - new Date(rows[0].updated_at).getTime()) / 60000;
          if (minsAgo < 60) {
            const wait = Math.ceil(60 - minsAgo);
            return res.status(429).json({ error: `Updated too recently. Try again in ${wait} minute${wait !== 1 ? 's' : ''}.` });
          }
        }
      }
    } catch {}
  }

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

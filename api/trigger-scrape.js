export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const steamid = req.query.steamid;
  if (!steamid || !/^\d{17}$/.test(steamid)) {
    return res.status(400).json({ error: 'Invalid steamid' });
  }

  const token = process.env.GH_TOKEN;
  if (!token) return res.status(500).json({ error: 'No token configured' });

  // Block scraping if player was removed by admin
  try {
    const check = await fetch(`https://raw.githubusercontent.com/rxdstrx/kzlb/main/cache/${steamid}.json`);
    if (check.ok) {
      const d = await check.json();
      if (d.removed) return res.status(200).json({ ok: true, removed: true });
    }
  } catch {}

  // Trigger add-player.yml (not scrape-kz.yml) — add-player also adds the player
  // to their country leaderboard and rebuilds world. Country 'xx' = auto-detect via Faceit.
  const response = await fetch('https://api.github.com/repos/rxdstrx/kzlb/actions/workflows/add-player.yml/dispatches', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ref: 'main', inputs: { steamid, country: 'xx', nickname: '' } }),
  });

  if (response.status === 204) return res.status(200).json({ ok: true });
  const text = await response.text();
  return res.status(response.status).json({ error: text });
}

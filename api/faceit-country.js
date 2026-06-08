export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { steamid } = req.query;
  if (!steamid || !/^\d{17}$/.test(steamid)) {
    return res.status(400).json({ error: 'Invalid steamid' });
  }

  const key = process.env.FACEIT_KEY;
  if (!key) return res.status(500).json({ error: 'FACEIT_KEY not configured' });

  try {
    const r = await fetch(`https://open.faceit.com/data/v4/players?game=cs2&game_player_id=${steamid}`, {
      headers: { 'Authorization': `Bearer ${key}` },
    });

    if (!r.ok) return res.status(404).json({ error: 'Player not found on Faceit' });

    const data = await r.json();
    return res.status(200).json({
      country: data.country?.toLowerCase() || null,
      nickname: data.nickname || null,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

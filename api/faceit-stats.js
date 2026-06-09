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
    const cs2 = data.games?.cs2 || {};
    return res.status(200).json({
      nickname: data.nickname || null,
      avatar: data.avatar || null,
      elo: cs2.faceit_elo || null,
      level: cs2.skill_level || null,
      faceit_url: data.faceit_url?.replace('{lang}', 'en') || null,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

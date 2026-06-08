export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const input = req.query.input?.trim();
  if (!input) return res.status(400).json({ error: 'No input' });

  const key = process.env.FACEIT_KEY;
  if (!key) return res.status(500).json({ error: 'FACEIT_KEY not configured' });

  // Extract nickname from URL or use as-is
  let nickname = input;
  const urlMatch = input.match(/faceit\.com\/(?:[a-z]{2}\/)?players\/([^/?#]+)/i);
  if (urlMatch) nickname = urlMatch[1];

  try {
    const r = await fetch(`https://open.faceit.com/data/v4/players?nickname=${encodeURIComponent(nickname)}`, {
      headers: { 'Authorization': `Bearer ${key}` },
    });

    if (!r.ok) return res.status(404).json({ error: 'Player not found on Faceit' });

    const data = await r.json();
    return res.status(200).json({
      steamid: data.steam_id_64 || null,
      country: data.country || null,
      nickname: data.nickname || null,
      avatar: data.avatar || null,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

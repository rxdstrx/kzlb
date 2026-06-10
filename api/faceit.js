// Merged: faceit-resolve + faceit-country + faceit-stats
// action=resolve : lookup by nickname/URL → steamid, country, nickname, avatar
// action=country : lookup by steamid → country, nickname
// action=stats   : lookup by steamid → elo, level, faceit_url

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const key = process.env.FACEIT_KEY;
  if (!key) return res.status(500).json({ error: 'FACEIT_KEY not configured' });

  const { action, input, steamid } = req.query;

  try {
    if (action === 'resolve') {
      if (!input) return res.status(400).json({ error: 'No input' });
      let nickname = input.trim();
      const urlMatch = nickname.match(/faceit\.com\/(?:[a-z]{2}\/)?players\/([^/?#]+)/i);
      if (urlMatch) nickname = urlMatch[1];
      const r = await fetch(`https://open.faceit.com/data/v4/players?nickname=${encodeURIComponent(nickname)}`, {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!r.ok) return res.status(404).json({ error: 'Player not found on Faceit' });
      const d = await r.json();
      return res.status(200).json({ steamid: d.steam_id_64 || null, country: d.country || null, nickname: d.nickname || null, avatar: d.avatar || null });
    }

    if (action === 'country') {
      if (!steamid || !/^\d{17}$/.test(steamid)) return res.status(400).json({ error: 'Invalid steamid' });
      const r = await fetch(`https://open.faceit.com/data/v4/players?game=cs2&game_player_id=${steamid}`, {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!r.ok) return res.status(404).json({ error: 'Player not found on Faceit' });
      const d = await r.json();
      return res.status(200).json({ country: d.country?.toLowerCase() || null, nickname: d.nickname || null });
    }

    if (action === 'stats') {
      if (!steamid || !/^\d{17}$/.test(steamid)) return res.status(400).json({ error: 'Invalid steamid' });
      const r = await fetch(`https://open.faceit.com/data/v4/players?game=cs2&game_player_id=${steamid}`, {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!r.ok) return res.status(404).json({ error: 'Player not found on Faceit' });
      const d = await r.json();
      const cs2 = d.games?.cs2 || {};
      return res.status(200).json({ nickname: d.nickname || null, avatar: d.avatar || null, elo: cs2.faceit_elo || null, level: cs2.skill_level || null, faceit_url: d.faceit_url?.replace('{lang}', 'en') || null });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

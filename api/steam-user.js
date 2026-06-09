export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { steamid } = req.query;
  if (!steamid || !/^\d{17}$/.test(steamid)) {
    return res.status(400).json({ error: 'Invalid steamid' });
  }

  // Try Steam API first
  const steamKey = process.env.STEAM_API_KEY;
  if (steamKey) {
    try {
      const r = await fetch(
        `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${steamKey}&steamids=${steamid}`
      );
      const d = await r.json();
      const player = d?.response?.players?.[0];
      if (player) {
        return res.json({
          nickname: player.personaname || '',
          avatar: player.avatarfull || player.avatarmedium || player.avatar || '',
        });
      }
    } catch {}
  }

  // Fallback: playerdb
  try {
    const r = await fetch(`https://playerdb.co/api/player/steam/${steamid}`);
    const d = await r.json();
    const p = d?.data?.player;
    if (p) {
      return res.json({
        nickname: p.username || '',
        avatar: p.avatar || '',
      });
    }
  } catch {}

  return res.status(404).json({ error: 'Player not found' });
}

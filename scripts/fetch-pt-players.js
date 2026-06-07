const fs = require('fs');
const path = require('path');

const FACEIT_KEY = process.env.FACEIT_KEY;
const LIMIT = 100;
const MAX_PAGES = 20; // up to 2000 players

async function fetchPage(offset) {
  const res = await fetch(
    `https://open.faceit.com/data/v4/rankings/games/cs2/regions/EU?country=pt&limit=${LIMIT}&offset=${offset}`,
    { headers: { 'Authorization': `Bearer ${FACEIT_KEY}` } }
  );
  if (!res.ok) {
    console.log(`Page ${offset}: status ${res.status}`);
    return [];
  }
  const data = await res.json();
  return data.items || [];
}

async function getSteamId(playerId) {
  const res = await fetch(
    `https://open.faceit.com/data/v4/players/${playerId}`,
    { headers: { 'Authorization': `Bearer ${FACEIT_KEY}` } }
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data.steam_id_64 || null;
}

(async () => {
  const players = [];

  for (let page = 0; page < MAX_PAGES; page++) {
    const offset = page * LIMIT;
    const items = await fetchPage(offset);
    if (!items.length) { console.log(`No more players at offset ${offset}`); break; }

    console.log(`Page ${page + 1}: got ${items.length} players`);

    for (const item of items) {
      const steamid = await getSteamId(item.player_id);
      if (steamid) {
        players.push({
          faceit_id: item.player_id,
          nickname: item.nickname,
          faceit_elo: item.faceit_elo,
          skill_level: item.skill_level,
          steamid64: steamid,
          country: 'pt',
        });
        console.log(`  ${item.nickname} → ${steamid}`);
      }
      await new Promise(r => setTimeout(r, 100)); // rate limit
    }

    if (items.length < LIMIT) break;
  }

  console.log(`\nTotal Portuguese players found: ${players.length}`);

  const cacheDir = path.join(__dirname, '..', 'cache');
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir);
  fs.writeFileSync(
    path.join(cacheDir, 'pt-players.json'),
    JSON.stringify({ updated_at: new Date().toISOString(), players }, null, 2)
  );
  console.log('Saved to cache/pt-players.json');
})();

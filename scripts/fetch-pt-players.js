const fs = require('fs');
const path = require('path');

const FACEIT_KEY = process.env.FACEIT_KEY;
const LIMIT = 100;

// Args: node fetch-pt-players.js <startOffset> <endOffset>
// e.g. node fetch-pt-players.js 5000 5100   → fetches positions 5001-5100
const startOffset = parseInt(process.argv[2] || '5000', 10);
const endOffset   = parseInt(process.argv[3] || '5100', 10);

const cacheDir = path.join(__dirname, '..', 'cache');
const ptFile   = path.join(cacheDir, 'pt-players.json');

// Load existing pt-players.json to skip already-known steamids
let existingPlayers = [];
if (fs.existsSync(ptFile)) {
  try { existingPlayers = JSON.parse(fs.readFileSync(ptFile, 'utf8')).players || []; } catch {}
}
const knownSteamids = new Set(existingPlayers.map(p => p.steamid64));
console.log(`Already have ${existingPlayers.length} players in pt-players.json`);

async function fetchPage(offset) {
  const res = await fetch(
    `https://open.faceit.com/data/v4/rankings/games/cs2/regions/EU?country=pt&limit=${LIMIT}&offset=${offset}`,
    { headers: { 'Authorization': `Bearer ${FACEIT_KEY}` } }
  );
  if (!res.ok) { console.log(`Offset ${offset}: status ${res.status}`); return []; }
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
  const newPlayers = [];

  for (let offset = startOffset; offset < endOffset; offset += LIMIT) {
    const items = await fetchPage(offset);
    if (!items.length) { console.log(`No more players at offset ${offset}`); break; }
    console.log(`Offset ${offset}: got ${items.length} players — resolving steamids in parallel...`);

    // Resolve all steamids in parallel (10 at a time)
    const BATCH = 10;
    for (let i = 0; i < items.length; i += BATCH) {
      const batch = items.slice(i, i + BATCH);
      const resolved = await Promise.all(batch.map(async item => {
        const steamid = await getSteamId(item.player_id);
        return { item, steamid };
      }));
      for (const { item, steamid } of resolved) {
        if (!steamid) continue;
        if (knownSteamids.has(steamid)) { console.log(`  SKIP ${item.nickname}`); continue; }
        newPlayers.push({
          faceit_id: item.player_id, nickname: item.nickname,
          faceit_elo: item.faceit_elo, skill_level: item.skill_level,
          steamid64: steamid, country: 'pt',
        });
        knownSteamids.add(steamid);
        console.log(`  ${item.nickname} → ${steamid}`);
      }
      if (i + BATCH < items.length) await new Promise(r => setTimeout(r, 200));
    }

    if (items.length < LIMIT) break;
  }

  console.log(`\nNew players found: ${newPlayers.length}`);

  // Append to existing pt-players.json
  const merged = [...existingPlayers, ...newPlayers];
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir);
  fs.writeFileSync(ptFile, JSON.stringify({ updated_at: new Date().toISOString(), players: merged }, null, 2));
  console.log(`pt-players.json now has ${merged.length} total players`);
})();

const fs = require('fs');
const path = require('path');

const CACHE_DIR = path.join(__dirname, '..', 'cache');
const FACEIT_KEY = process.env.FACEIT_KEY;

async function getFaceitCountry(steamid) {
  try {
    const res = await fetch(
      `https://open.faceit.com/data/v4/players?game=cs2&game_player_id=${steamid}`,
      { headers: { Authorization: `Bearer ${FACEIT_KEY}` } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.country?.toLowerCase() || null;
  } catch {
    return null;
  }
}

function getLeaderboardFile(country) {
  return path.join(CACHE_DIR, `${country}-kz-players.json`);
}

function loadLeaderboard(country) {
  const file = getLeaderboardFile(country);
  if (!fs.existsSync(file)) return [];
  try { return JSON.parse(fs.readFileSync(file, 'utf8')).players || []; } catch { return []; }
}

function saveLeaderboard(country, players) {
  const file = getLeaderboardFile(country);
  fs.writeFileSync(file, JSON.stringify({ updated_at: new Date().toISOString(), players }, null, 2));
}

async function main() {
  if (!FACEIT_KEY) { console.error('FACEIT_KEY not set'); process.exit(1); }

  // Load all country leaderboard files and build steamid → country map
  const files = fs.readdirSync(CACHE_DIR).filter(f => f.endsWith('-kz-players.json'));
  const playerMap = {}; // steamid → { country, player }

  for (const file of files) {
    const country = file.replace('-kz-players.json', '');
    const data = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, file), 'utf8'));
    for (const player of (data.players || [])) {
      playerMap[player.steamid] = { country, player };
    }
  }

  const steamids = Object.keys(playerMap);
  console.log(`Checking ${steamids.length} players for country changes…`);

  const moves = []; // { steamid, oldCountry, newCountry, player }

  for (let i = 0; i < steamids.length; i++) {
    const steamid = steamids[i];
    const { country: oldCountry, player } = playerMap[steamid];

    const newCountry = await getFaceitCountry(steamid);
    if (!newCountry) continue; // Not on Faceit or API error — skip
    if (newCountry === oldCountry) continue;

    console.log(`${player.nickname}: ${oldCountry} → ${newCountry}`);
    moves.push({ steamid, oldCountry, newCountry, player });

    // Rate limit: 1 request per 200ms
    await new Promise(r => setTimeout(r, 200));
  }

  if (!moves.length) {
    console.log('No country changes detected.');
    return;
  }

  // Apply moves
  const changed = new Set();
  for (const { steamid, oldCountry, newCountry, player } of moves) {
    // Remove from old leaderboard
    const oldPlayers = loadLeaderboard(oldCountry).filter(p => p.steamid !== steamid);
    saveLeaderboard(oldCountry, oldPlayers);
    changed.add(oldCountry);

    // Add to new leaderboard
    const newPlayers = loadLeaderboard(newCountry).filter(p => p.steamid !== steamid);
    newPlayers.push({ ...player, country: newCountry });
    saveLeaderboard(newCountry, newPlayers);
    changed.add(newCountry);

    // Update individual cache file
    const cacheFile = path.join(CACHE_DIR, `${steamid}.json`);
    if (fs.existsSync(cacheFile)) {
      const cacheData = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      cacheData.country = newCountry;
      fs.writeFileSync(cacheFile, JSON.stringify(cacheData, null, 2));
    }
  }

  // Rebuild world leaderboard
  const allPlayers = [];
  const allFiles = fs.readdirSync(CACHE_DIR).filter(f => f.endsWith('-kz-players.json') && f !== 'world-kz-players.json');
  for (const f of allFiles) {
    const d = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, f), 'utf8'));
    allPlayers.push(...(d.players || []));
  }
  allPlayers.sort((a, b) => b.kz_points - a.kz_points);
  fs.writeFileSync(path.join(CACHE_DIR, 'world-kz-players.json'), JSON.stringify({ updated_at: new Date().toISOString(), players: allPlayers }, null, 2));

  console.log(`Moved ${moves.length} player(s). Updated leaderboards: ${[...changed].join(', ')}`);
}

main().catch(e => { console.error(e); process.exit(1); });

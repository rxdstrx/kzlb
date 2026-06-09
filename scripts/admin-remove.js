// Remove a player from all leaderboard files
// Usage: node admin-remove.js <steamid>
const fs = require('fs');
const path = require('path');

const steamid = process.argv[2];
if (!steamid || !/^\d{17}$/.test(steamid)) {
  console.error('Usage: node admin-remove.js <steamid>');
  process.exit(1);
}

const cacheDir = path.join(__dirname, '..', 'cache');

// Remove from all country files
const allFiles = fs.readdirSync(cacheDir).filter(f => f.endsWith('-kz-players.json') && f !== 'world-kz-players.json');
let found = false;
for (const f of allFiles) {
  const fPath = path.join(cacheDir, f);
  try {
    const data = JSON.parse(fs.readFileSync(fPath, 'utf8'));
    const before = data.players.length;
    data.players = data.players.filter(p => p.steamid !== steamid);
    if (data.players.length !== before) {
      fs.writeFileSync(fPath, Buffer.from(JSON.stringify(data, null, 2), 'utf8'));
      console.log(`Removed from ${f}`);
      found = true;
    }
  } catch {}
}

if (!found) { console.error('Player not found'); process.exit(1); }

// Remove individual cache file
const indFile = path.join(cacheDir, `${steamid}.json`);
if (fs.existsSync(indFile)) {
  fs.unlinkSync(indFile);
  console.log(`Deleted ${steamid}.json`);
}

// Rebuild world
const countryFiles = fs.readdirSync(cacheDir).filter(f => f.endsWith('-kz-players.json') && f !== 'world-kz-players.json');
const seen = new Set();
const worldPlayers = [];
for (const f of countryFiles) {
  try {
    const ps = JSON.parse(fs.readFileSync(path.join(cacheDir, f), 'utf8')).players || [];
    for (const p of ps) { if (!seen.has(p.steamid)) { seen.add(p.steamid); worldPlayers.push(p); } }
  } catch {}
}
worldPlayers.sort((a, b) => b.kz_points - a.kz_points);
fs.writeFileSync(path.join(cacheDir, 'world-kz-players.json'), Buffer.from(JSON.stringify({ updated_at: new Date().toISOString(), players: worldPlayers }, null, 2), 'utf8'));
console.log(`World rebuilt: ${worldPlayers.length} players`);
console.log(`Done! ${steamid} removed.`);

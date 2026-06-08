const fs   = require('fs');
const path = require('path');

const cacheDir = path.join(__dirname, '..', 'cache');

// Strip BOM if present and parse JSON safely
function readJSON(file) {
  let raw = fs.readFileSync(file, 'utf8');
  if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1); // strip BOM
  return JSON.parse(raw);
}

const seen    = new Set();
const players = [];

const files = fs.readdirSync(cacheDir)
  .filter(f => f.endsWith('-kz-players.json') && f !== 'world-kz-players.json');

for (const file of files) {
  try {
    const data = readJSON(path.join(cacheDir, file));
    for (const p of (data.players || [])) {
      if (!seen.has(p.steamid)) {
        seen.add(p.steamid);
        players.push(p);
      }
    }
  } catch (e) {
    console.warn(`Skipped ${file}: ${e.message}`);
  }
}

players.sort((a, b) => b.kz_points - a.kz_points);

const out = JSON.stringify({ updated_at: new Date().toISOString(), players }, null, 2);
// Write without BOM using Buffer
fs.writeFileSync(path.join(cacheDir, 'world-kz-players.json'), Buffer.from(out, 'utf8'));

console.log(`Done — ${players.length} players written to world-kz-players.json`);

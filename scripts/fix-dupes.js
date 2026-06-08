// Remove duplicate steamids from all country files (keep first occurrence per file)
// then rebuild world
const fs   = require('fs');
const path = require('path');

const cacheDir = path.join(__dirname, '..', 'cache');

function readJSON(file) {
  let raw = fs.readFileSync(file, 'utf8');
  if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
  return JSON.parse(raw);
}

const countryFiles = fs.readdirSync(cacheDir)
  .filter(f => f.endsWith('-kz-players.json') && f !== 'world-kz-players.json');

// Track which steamids we've seen across ALL country files
// If a player appears in multiple files, keep only the LATEST country (last file alphabetically)
// First pass: find which country each steamid belongs to (last seen wins)
const steamidCountry = {};
for (const file of countryFiles) {
  try {
    const data = readJSON(path.join(cacheDir, file));
    const code = file.replace('-kz-players.json', '');
    for (const p of (data.players || [])) {
      steamidCountry[p.steamid] = code;
    }
  } catch (e) { console.warn(`Skipped ${file}: ${e.message}`); }
}

// Second pass: remove players from files where they don't belong (cross-file dupes)
let totalRemoved = 0;
for (const file of countryFiles) {
  const filePath = path.join(cacheDir, file);
  const code = file.replace('-kz-players.json', '');
  try {
    const data = readJSON(filePath);
    const before = data.players.length;
    // Keep only players whose canonical country is this file
    data.players = data.players.filter(p => steamidCountry[p.steamid] === code);
    // Also dedupe within the file itself
    const seen = new Set();
    data.players = data.players.filter(p => {
      if (seen.has(p.steamid)) return false;
      seen.add(p.steamid); return true;
    });
    const removed = before - data.players.length;
    if (removed > 0) {
      fs.writeFileSync(filePath, Buffer.from(JSON.stringify(data, null, 2), 'utf8'));
      console.log(`${file}: removed ${removed} duplicate(s)`);
      totalRemoved += removed;
    }
  } catch (e) { console.warn(`Skipped ${file}: ${e.message}`); }
}

console.log(`\nTotal removed: ${totalRemoved}`);

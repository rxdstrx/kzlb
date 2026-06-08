// For each map, find the highest "total" in place_num (the Y in "X / Y")
// and apply it to every player's record for that map across all country files.
// Uses plain spaces only — no non-breaking spaces.
const fs   = require('fs');
const path = require('path');

const cacheDir = path.join(__dirname, '..', 'cache');

function readJSON(file) {
  let raw = fs.readFileSync(file, 'utf8');
  if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
  return JSON.parse(raw);
}

function stripNum(s) {
  // Remove any kind of space/nbsp and non-digit chars to get the raw number
  if (!s) return 0;
  return parseInt(s.replace(/[^\d]/g, ''), 10) || 0;
}

function fmtNum(n) {
  // Format with regular spaces as thousands separator (no nbsp)
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function parseTotal(placeNum) {
  if (!placeNum) return 0;
  const parts = placeNum.split('/');
  if (parts.length < 2) return 0;
  return stripNum(parts[1]);
}

function parseRank(placeNum) {
  if (!placeNum) return null;
  const parts = placeNum.split('/');
  const n = stripNum(parts[0]);
  return n || null;
}

const countryFiles = fs.readdirSync(cacheDir)
  .filter(f => f.endsWith('-kz-players.json') && f !== 'world-kz-players.json');

// First pass: collect max total per map
const mapMaxTotal = {};
for (const file of countryFiles) {
  try {
    const data = readJSON(path.join(cacheDir, file));
    for (const p of (data.players || [])) {
      for (const m of (p.maps_list || [])) {
        const total = parseTotal(m.place_num);
        if (total > (mapMaxTotal[m.map] || 0)) mapMaxTotal[m.map] = total;
      }
    }
  } catch (e) { console.warn(`Skipped ${file}: ${e.message}`); }
}

console.log(`Found totals for ${Object.keys(mapMaxTotal).length} maps`);

// Second pass: update every player's place_num with the max total
let updated = 0;
for (const file of countryFiles) {
  const filePath = path.join(cacheDir, file);
  try {
    const data = readJSON(filePath);
    let changed = false;
    for (const p of (data.players || [])) {
      for (const m of (p.maps_list || [])) {
        const maxTotal = mapMaxTotal[m.map];
        if (!maxTotal) continue;
        const rank = parseRank(m.place_num);
        if (rank === null) continue;
        const newPlace = `${fmtNum(rank)} / ${fmtNum(maxTotal)}`;
        if (m.place_num !== newPlace) {
          m.place_num = newPlace;
          changed = true;
          updated++;
        }
      }
    }
    if (changed) {
      fs.writeFileSync(filePath, Buffer.from(JSON.stringify(data, null, 2), 'utf8'));
      console.log(`Updated: ${file}`);
    }
  } catch (e) { console.warn(`Skipped ${file}: ${e.message}`); }
}

console.log(`\nNormalized ${updated} place_num entries`);

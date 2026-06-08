// For each map, find the highest "total" in place_num (the Y in "X / Y")
// and apply it to every player's record for that map across all country files.
const fs   = require('fs');
const path = require('path');

const cacheDir = path.join(__dirname, '..', 'cache');

function readJSON(file) {
  let raw = fs.readFileSync(file, 'utf8');
  if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
  return JSON.parse(raw);
}

function parseTotal(placeNum) {
  if (!placeNum) return 0;
  // "1 069 / 27 186" — strip nbsp and spaces, split on /
  const clean = placeNum.replace(/ /g, '').replace(/\s/g, '');
  const parts = clean.split('/');
  if (parts.length < 2) return 0;
  return parseInt(parts[1].replace(/\D/g, ''), 10) || 0;
}

function formatNum(n) {
  // Format number with non-breaking space thousands separator
  return n.toLocaleString('fr-FR').replace(/\s/g, ' ');
}

function getRank(placeNum) {
  if (!placeNum) return null;
  const clean = placeNum.replace(/ /g, '').replace(/\s/g, '');
  const parts = clean.split('/');
  return parseInt(parts[0].replace(/\D/g, ''), 10) || null;
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
        const rank = getRank(m.place_num);
        if (rank === null) continue;
        const newPlace = `${formatNum(rank)} / ${formatNum(maxTotal)}`;
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

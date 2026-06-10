// Move a player to a different country file
// Usage: node move-player-country.js <steamid> <newCountry>
const fs = require('fs');
const path = require('path');

const steamid = process.argv[2];
const newCountry = process.argv[3];

if (!steamid || !newCountry) {
  console.error('Usage: node move-player-country.js <steamid> <newCountry>');
  process.exit(1);
}

const cacheDir = path.join(__dirname, '..', 'cache');

// Find player in all country files and remove them
const allFiles = fs.readdirSync(cacheDir).filter(f => f.endsWith('-kz-players.json') && f !== 'world-kz-players.json');
let player = null;

for (const f of allFiles) {
  const fPath = path.join(cacheDir, f);
  try {
    const raw = fs.readFileSync(fPath, 'utf8').replace(/^﻿/, '');
    const data = JSON.parse(raw);
    const idx = data.players.findIndex(p => p.steamid === steamid);
    if (idx !== -1) {
      player = { ...data.players[idx], country: newCountry };
      data.players.splice(idx, 1);
      fs.writeFileSync(fPath, Buffer.from(JSON.stringify(data, null, 2), 'utf8'));
      console.log(`Removed from ${f}`);
    }
  } catch (e) { console.warn(`Could not parse ${f}: ${e.message}`); }
}

// If not in any country file yet (new player), build from their individual cache
if (!player) {
  const indPath = path.join(cacheDir, `${steamid}.json`);
  if (fs.existsSync(indPath)) {
    try {
      const ind = JSON.parse(fs.readFileSync(indPath, 'utf8').replace(/^﻿/, ''));
      // Use mapsData header/desc — this endpoint queries by steamid64, so it returns
      // the correct player's stats. The userData endpoint returns the authenticated
      // user's (cookie owner's) stats and must not be used for points/place.
      const header = ind.maps?.header || {};
      const desc   = header.desc || {};
      player = {
        steamid,
        nickname:  header.name || header.title || steamid,
        avatar:    header.avatar || '',
        country:   newCountry,
        kz_points: Number(desc['{{Points}}'] || ind.kz_points || 0),
        kz_place:  desc['{{Position}}']       || ind.kz_place  || null,
        kz_maps:   desc['{{COMPLETIONS-MAP}}'] || ind.kz_maps   || 0,
        maps_list: ind.maps?.list || [],
      };
      console.log(`New player — built from ${steamid}.json`);
    } catch (e) {
      console.error('Player not found and cache unreadable:', e.message);
      process.exit(1);
    }
  } else {
    console.error('Player not found in any country file and no individual cache exists');
    process.exit(1);
  }
}

// Add to new country file
const newFile = path.join(cacheDir, `${newCountry}-kz-players.json`);
let newData = { updated_at: new Date().toISOString(), players: [] };
if (fs.existsSync(newFile)) {
  try { newData = JSON.parse(fs.readFileSync(newFile, 'utf8').replace(/^﻿/, '')); } catch {}
}
newData.players.push(player);
newData.players.sort((a, b) => b.kz_points - a.kz_points);
newData.updated_at = new Date().toISOString();
fs.writeFileSync(newFile, Buffer.from(JSON.stringify(newData, null, 2), 'utf8'));
console.log(`Added to ${newCountry}-kz-players.json`);

// Update individual cache file
const indFile = path.join(cacheDir, `${steamid}.json`);
if (fs.existsSync(indFile)) {
  try {
    const ind = JSON.parse(fs.readFileSync(indFile, 'utf8').replace(/^﻿/, ''));
    ind.country = newCountry;
    fs.writeFileSync(indFile, Buffer.from(JSON.stringify(ind, null, 2), 'utf8'));
    console.log(`Updated ${steamid}.json country to ${newCountry}`);
  } catch {}
}

// Rebuild world
const worldFile = path.join(cacheDir, 'world-kz-players.json');
const seen = new Set();
const worldPlayers = [];
const countryFiles = fs.readdirSync(cacheDir).filter(f => f.endsWith('-kz-players.json') && f !== 'world-kz-players.json');
for (const f of countryFiles) {
  try {
    const ps = JSON.parse(fs.readFileSync(path.join(cacheDir, f), 'utf8').replace(/^﻿/, '')).players || [];
    for (const p of ps) { if (!seen.has(p.steamid)) { seen.add(p.steamid); worldPlayers.push(p); } }
  } catch {}
}
worldPlayers.sort((a, b) => b.kz_points - a.kz_points);
fs.writeFileSync(worldFile, Buffer.from(JSON.stringify({ updated_at: new Date().toISOString(), players: worldPlayers }, null, 2), 'utf8'));
console.log(`World rebuilt: ${worldPlayers.length} players`);
console.log(`Done! ${player.nickname} moved to ${newCountry}`);

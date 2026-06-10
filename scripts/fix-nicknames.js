// fix-nicknames.js
// Fetches Steam personanames for all players and updates cache files.
// Runs in batches of 100 (Steam API limit).
// Usage: node scripts/fix-nicknames.js

const fs   = require('fs');
const path = require('path');

const CACHE_DIR   = path.join(__dirname, '..', 'cache');
const WORLD_FILE  = path.join(CACHE_DIR, 'world-kz-players.json');
const STEAM_KEY   = process.env.STEAM_API_KEY;

if (!STEAM_KEY) {
  console.error('ERROR: STEAM_API_KEY env var required.');
  process.exit(1);
}

// ── helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function readJSON(fPath) {
  try {
    const raw = fs.readFileSync(fPath, 'utf8').replace(/^﻿/, '');
    return JSON.parse(raw);
  } catch { return null; }
}

// Fetch Steam personanames for up to 100 steamids at once
async function fetchSteamNames(steamids) {
  const url = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${STEAM_KEY}&steamids=${steamids.join(',')}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Steam API ${res.status}`);
  const data = await res.json();
  const map = {};
  for (const p of (data?.response?.players || [])) {
    map[p.steamid] = p.personaname;
  }
  return map;
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  // 1. Collect all steamid json files
  const files = fs.readdirSync(CACHE_DIR).filter(f => /^\d{17}\.json$/.test(f));
  console.log(`Found ${files.length} player cache files.`);

  // 2. Fetch all nicknames in batches of 100
  const allSteamids = files.map(f => f.replace('.json', ''));
  const nicknameMap = {};
  const BATCH = 100;

  for (let i = 0; i < allSteamids.length; i += BATCH) {
    const batch = allSteamids.slice(i, i + BATCH);
    process.stdout.write(`Fetching Steam names ${i + 1}–${Math.min(i + BATCH, allSteamids.length)} / ${allSteamids.length}... `);
    try {
      const names = await fetchSteamNames(batch);
      Object.assign(nicknameMap, names);
      console.log(`got ${Object.keys(names).length}`);
    } catch (e) {
      console.log(`ERROR: ${e.message}`);
    }
    if (i + BATCH < allSteamids.length) await sleep(300); // gentle rate-limit
  }

  console.log(`\nTotal nicknames fetched: ${Object.keys(nicknameMap).length}`);

  // 3. Update individual player cache files
  let updated = 0, skipped = 0;
  for (const f of files) {
    const steamid = f.replace('.json', '');
    const newNick = nicknameMap[steamid];
    if (!newNick) { skipped++; continue; }

    const fPath = path.join(CACHE_DIR, f);
    const data  = readJSON(fPath);
    if (!data) { skipped++; continue; }

    if (data.nickname === newNick) { skipped++; continue; } // no change

    data.nickname = newNick;
    fs.writeFileSync(fPath, JSON.stringify(data, null, 2), 'utf8');
    updated++;
  }
  console.log(`Individual files: ${updated} updated, ${skipped} unchanged/skipped.`);

  // 4. Update world cache
  const world = readJSON(WORLD_FILE);
  if (world?.players) {
    let worldUpdated = 0;
    for (const p of world.players) {
      const newNick = nicknameMap[p.steamid];
      if (newNick && p.nickname !== newNick) {
        p.nickname = newNick;
        worldUpdated++;
      }
    }
    fs.writeFileSync(WORLD_FILE, JSON.stringify(world, null, 2), 'utf8');
    console.log(`World cache: ${worldUpdated} nicknames updated.`);
  }

  // 5. Update all country cache files
  const countryFiles = fs.readdirSync(CACHE_DIR).filter(f => /^[a-z]{2}-kz-players\.json$/.test(f));
  let countryTotal = 0;
  for (const cf of countryFiles) {
    const cfPath = path.join(CACHE_DIR, cf);
    const data   = readJSON(cfPath);
    if (!data?.players) continue;
    let changed = false;
    for (const p of data.players) {
      const newNick = nicknameMap[p.steamid];
      if (newNick && p.nickname !== newNick) {
        p.nickname = newNick;
        changed = true;
        countryTotal++;
      }
    }
    if (changed) fs.writeFileSync(cfPath, JSON.stringify(data, null, 2), 'utf8');
  }
  console.log(`Country caches: ${countryTotal} nicknames updated across ${countryFiles.length} files.`);

  console.log('\nDone! Run rebuild-world.js if needed, then commit & push.');
}

main().catch(e => { console.error(e); process.exit(1); });

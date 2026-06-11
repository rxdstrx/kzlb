/**
 * scrape-top100.js
 * Fetches top 100 KZ players via Python curl_cffi scraper (no Puppeteer).
 * ~2 min total vs 30+ min with Puppeteer.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const FACEIT_KEY = process.env.FACEIT_KEY;
const cacheDir = path.join(__dirname, '..', 'cache');

function fmtNum(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }

async function getFaceitCountry(steamid) {
  if (!FACEIT_KEY) return 'xx';
  try {
    const res = await fetch(`https://open.faceit.com/data/v4/players?game=cs2&game_player_id=${steamid}`, {
      headers: { 'Authorization': `Bearer ${FACEIT_KEY}` }
    });
    if (!res.ok) return 'xx';
    const data = await res.json();
    return data.country?.toLowerCase() || 'xx';
  } catch { return 'xx'; }
}

(async () => {
  // Step 1: scrape all top 100 players via Python (one process, one session)
  console.log('Scraping top 100 via curl_cffi...');
  let scraped;
  try {
    const pyOut = execSync(
      'python3 scripts/scrape-cybershoke.py --top100',
      { env: { ...process.env }, timeout: 300000, encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 }
    );
    scraped = JSON.parse(pyOut.trim());
    console.log(`✅ Got ${scraped.length} players from Python scraper`);
  } catch (e) {
    console.error('❌ Python scraper failed:', e.message);
    process.exit(1);
  }

  // Step 2: for each player, resolve country + write individual cache file
  const results = [];
  for (let i = 0; i < scraped.length; i++) {
    const p = scraped[i];
    const sid = p.steamid;
    if (!sid || p.error) {
      console.log(`[${i+1}/${scraped.length}] Skipping ${sid} — ${p.error}`);
      continue;
    }

    // Use existing cached country if available, otherwise Faceit
    let country = 'xx';
    const indFile = path.join(cacheDir, `${sid}.json`);
    if (fs.existsSync(indFile)) {
      try {
        const cached = JSON.parse(fs.readFileSync(indFile, 'utf8'));
        if (cached.country && cached.country !== 'xx') country = cached.country;
      } catch {}
    }
    if (country === 'xx') {
      country = await getFaceitCountry(sid);
    }

    const player = {
      steamid: sid,
      nickname: p.nickname || sid,
      country,
      cached_at: new Date().toISOString(),
      kz_points: p.kz_points || 0,
      kz_place: p.kz_place || 0,
      kz_maps: p.kz_maps || '0',
      avatar: p.avatar || '',
      maps_list: p.maps || [],
    };

    // Write individual cache file (same format as before)
    const mapsDataCompat = {
      header: {
        title: p.nickname,
        avatar: p.avatar,
        desc: {
          '{{Points}}': p.kz_points,
          '{{Position}}': p.kz_place,
          '{{COMPLETIONS-MAP}}': p.kz_maps,
        },
      },
      list: p.maps || [],
    };
    fs.writeFileSync(indFile, JSON.stringify({
      steamid: sid, country, cached_at: new Date().toISOString(), user: {}, maps: mapsDataCompat,
    }, null, 2));

    results.push(player);
    console.log(`[${i+1}/${scraped.length}] ${player.nickname} (${country}) — ${player.maps_list.length} maps, ${player.kz_points} pts`);
  }

  // Step 3: remove from all country files, re-add to correct ones
  const allCountryFiles = fs.readdirSync(cacheDir).filter(f => f.endsWith('-kz-players.json') && f !== 'world-kz-players.json');
  const allNewSteamids = new Set(results.map(p => p.steamid));
  for (const cf of allCountryFiles) {
    const cfPath = path.join(cacheDir, cf);
    try {
      const d = JSON.parse(fs.readFileSync(cfPath, 'utf8'));
      const before = d.players.length;
      d.players = d.players.filter(p => !allNewSteamids.has(p.steamid));
      if (d.players.length !== before) fs.writeFileSync(cfPath, Buffer.from(JSON.stringify(d, null, 2), 'utf8'));
    } catch {}
  }

  const byCountry = {};
  for (const player of results) {
    if (!byCountry[player.country]) byCountry[player.country] = [];
    byCountry[player.country].push(player);
  }

  for (const [country, players] of Object.entries(byCountry)) {
    const cfPath = path.join(cacheDir, `${country}-kz-players.json`);
    let existing = [];
    if (fs.existsSync(cfPath)) {
      try { existing = JSON.parse(fs.readFileSync(cfPath, 'utf8')).players || []; } catch {}
    }
    const merged = [...existing, ...players].sort((a, b) => b.kz_points - a.kz_points);
    fs.writeFileSync(cfPath, Buffer.from(JSON.stringify({ updated_at: new Date().toISOString(), players: merged }, null, 2), 'utf8'));
    console.log(`Saved ${players.length} to ${country}-kz-players.json`);
  }

  // Step 4: normalize place totals
  const countryFiles = fs.readdirSync(cacheDir).filter(f => f.endsWith('-kz-players.json') && f !== 'world-kz-players.json');
  const mapMaxTotal = {};
  for (const cf of countryFiles) {
    try {
      const players = JSON.parse(fs.readFileSync(path.join(cacheDir, cf), 'utf8')).players || [];
      for (const p of players) {
        for (const m of (p.maps_list || [])) {
          if (!m.place_num) continue;
          const clean = m.place_num.replace(/[\s ]/g, '');
          const parts = clean.split('/');
          if (parts.length < 2) continue;
          const total = parseInt(parts[1].replace(/\D/g, ''), 10) || 0;
          if (total > (mapMaxTotal[m.map] || 0)) mapMaxTotal[m.map] = total;
        }
      }
    } catch {}
  }
  for (const cf of countryFiles) {
    const cfPath = path.join(cacheDir, cf);
    try {
      const fileData = JSON.parse(fs.readFileSync(cfPath, 'utf8'));
      let changed = false;
      for (const p of (fileData.players || [])) {
        for (const m of (p.maps_list || [])) {
          const maxTotal = mapMaxTotal[m.map];
          if (!maxTotal || !m.place_num) continue;
          const clean = m.place_num.replace(/[\s ]/g, '');
          const parts = clean.split('/');
          if (parts.length < 2) continue;
          const rank = parseInt(parts[0].replace(/\D/g, ''), 10) || 0;
          const newPlace = `${fmtNum(rank)} / ${fmtNum(maxTotal)}`;
          if (m.place_num !== newPlace) { m.place_num = newPlace; changed = true; }
        }
      }
      if (changed) fs.writeFileSync(cfPath, Buffer.from(JSON.stringify(fileData, null, 2), 'utf8'));
    } catch {}
  }

  // Save map-totals.json
  const totalsFile = path.join(cacheDir, 'map-totals.json');
  let existingTotals = {};
  try { existingTotals = JSON.parse(fs.readFileSync(totalsFile, 'utf8')); } catch {}
  let totalsMerged = { ...existingTotals };
  for (const [map, total] of Object.entries(mapMaxTotal)) {
    if (total > (totalsMerged[map] || 0)) totalsMerged[map] = total;
  }
  fs.writeFileSync(totalsFile, JSON.stringify(totalsMerged, null, 2));
  console.log(`Saved map-totals.json (${Object.keys(totalsMerged).length} maps)`);

  // Step 5: rebuild world
  const seen = new Set();
  const worldPlayers = [];
  for (const cf of countryFiles) {
    try {
      const ps = JSON.parse(fs.readFileSync(path.join(cacheDir, cf), 'utf8')).players || [];
      for (const p of ps) { if (!seen.has(p.steamid)) { seen.add(p.steamid); worldPlayers.push(p); } }
    } catch {}
  }
  worldPlayers.sort((a, b) => b.kz_points - a.kz_points);
  fs.writeFileSync(path.join(cacheDir, 'world-kz-players.json'), Buffer.from(JSON.stringify({ updated_at: new Date().toISOString(), players: worldPlayers }, null, 2), 'utf8'));

  console.log(`\n✓ Done! ${results.length} players saved | world: ${worldPlayers.length} total`);
})();

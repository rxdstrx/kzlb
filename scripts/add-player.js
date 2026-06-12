const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const steamid = process.argv[2];
let country = (process.argv[3] || 'xx').toLowerCase();
const nickname = process.argv[4] || '';

if (!steamid || !/^\d{17}$/.test(steamid)) {
  console.error('Usage: node add-player.js <steamid64> <country> [nickname]');
  process.exit(1);
}

const FACEIT_KEY = process.env.FACEIT_KEY;
const COOKIE = process.env.CYBERSHOKE_COOKIE;

async function getFaceitCountry(sid) {
  if (!FACEIT_KEY) return null;
  try {
    const res = await fetch(`https://open.faceit.com/data/v4/players?game=cs2&game_player_id=${sid}`, {
      headers: { 'Authorization': `Bearer ${FACEIT_KEY}` }
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.country?.toLowerCase() || null;
  } catch { return null; }
}

const cacheDir = path.join(__dirname, '..', 'cache');

function getLeaderboardFile(c) {
  return path.join(cacheDir, `${c}-kz-players.json`);
}

(async () => {
  // ── Scrape via Python curl_cffi (replaces Puppeteer — ~1s vs 2min) ──
  console.log(`Scraping KZ stats for ${steamid} via curl_cffi...`);
  let mapsData, userData;
  try {
    const pyOut = execSync(
      `python3 scripts/scrape-cybershoke.py ${steamid}`,
      { env: { ...process.env }, timeout: 60000, encoding: 'utf8' }
    );
    const scraped = JSON.parse(pyOut.trim());
    if (scraped.error) throw new Error(scraped.error);

    // Reshape into the same format the rest of the script expects
    mapsData = {
      header: {
        title: scraped.nickname,
        avatar: scraped.avatar,
        desc: {
          '{{Points}}': scraped.kz_points,
          '{{Position}}': scraped.kz_place,
          '{{COMPLETIONS-MAP}}': scraped.kz_maps,
        },
      },
      list: scraped.maps.map(m => ({
        map: m.map,
        points: m.points,
        time_record: m.time_record,
        unixtime_record: m.unixtime_record,
        place_num: m.place_num,
        tier: m.tier,
        completions: m.completions,
      })),
    };
    userData = {};
    console.log(`✅ Scraped ${scraped.maps.length} maps for ${scraped.nickname} in ~1s`);
  } catch (e) {
    console.error('❌ Python scraper failed:', e.message);
    process.exit(1);
  }

  // If country still unknown, try Faceit then Steam API
  if (country === 'xx') {
    console.log('Country unknown — trying Faceit lookup...');
    const faceitCountry = await getFaceitCountry(steamid);
    if (faceitCountry) {
      country = faceitCountry;
      console.log(`Found country via Faceit: ${country}`);
    } else {
      // Fallback 1: Steam GetPlayerSummaries (needs STEAM_API_KEY secret)
      console.log('No Faceit account — trying Steam API for country...');
      let foundCountry = false;
      try {
        const STEAM_KEY = process.env.STEAM_API_KEY;
        if (STEAM_KEY) {
          const sr = await fetch(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${STEAM_KEY}&steamids=${steamid}`);
          const sd = await sr.json();
          const loc = sd?.response?.players?.[0]?.loccountrycode?.toLowerCase();
          if (loc) { country = loc; foundCountry = true; console.log(`Found country via Steam API: ${country}`); }
        }
      } catch (e) { console.log('Steam API lookup failed:', e.message); }

      // Fallback 2: playerdb.co (free, no key needed)
      if (!foundCountry) {
        try {
          const pr = await fetch(`https://playerdb.co/api/player/steam/${steamid}`);
          const pd = await pr.json();
          const loc = pd?.data?.player?.meta?.loccountrycode?.toLowerCase();
          if (loc) { country = loc; foundCountry = true; console.log(`Found country via playerdb: ${country}`); }
          else console.log('No country found anywhere — using xx.');
        } catch (e) { console.log('playerdb lookup failed:', e.message); }
      }
    }
  }

  const mapList = mapsData?.list || [];
  const desc = mapsData?.header?.desc || {};

  // Always prefer Steam nickname — Cybershoke may show Faceit nickname instead
  let resolvedNickname = nickname || '';

  // 1. Try Steam API (most reliable)
  if (!resolvedNickname) {
    try {
      const STEAM_KEY = process.env.STEAM_API_KEY;
      if (STEAM_KEY) {
        const sr = await fetch(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${STEAM_KEY}&steamids=${steamid}`);
        const sd = await sr.json();
        const steamName = sd?.response?.players?.[0]?.personaname;
        if (steamName) { resolvedNickname = steamName; console.log(`Nickname from Steam API: ${resolvedNickname}`); }
      }
    } catch (e) { console.log('Steam API nickname lookup failed:', e.message); }
  }

  // 2. Fallback: playerdb.co (free, no key needed)
  if (!resolvedNickname) {
    try {
      const steamRes = await fetch(`https://playerdb.co/api/player/steam/${steamid}`);
      const steamData = await steamRes.json();
      resolvedNickname = steamData?.data?.player?.username || '';
      if (resolvedNickname) console.log(`Nickname from playerdb: ${resolvedNickname}`);
    } catch (e) { console.log('playerdb nickname lookup failed:', e.message); }
  }

  // 3. Last resort: Cybershoke display name (may be Faceit nickname)
  if (!resolvedNickname) {
    resolvedNickname = mapsData?.header?.title || steamid;
    console.log(`Nickname fallback (Cybershoke/steamid): ${resolvedNickname}`);
  }

  const player = {
    steamid,
    nickname: resolvedNickname,
    country,
    cached_at: new Date().toISOString(),
    kz_points: desc['{{Points}}'] || 0,
    kz_place: desc['{{Position}}'] || 0,
    kz_maps: desc['{{COMPLETIONS-MAP}}'] || '0',
    avatar: mapsData?.header?.avatar || await fetch(`https://playerdb.co/api/player/steam/${steamid}`).then(r=>r.json()).then(d=>d?.data?.player?.avatar||'').catch(()=>''),
    maps_list: mapList,
  };

  // ── Sync to Supabase IMMEDIATELY after scrape — before file ops ──
  // This updates leaderboard + player_cache right away, not at the end
  const sbUrl = process.env.SUPABASE_URL;
  const sbKey = process.env.SUPABASE_SERVICE_KEY;
  if (sbUrl && sbKey) {
    const sbH = { apikey: sbKey, Authorization: `Bearer ${sbKey}`, 'Content-Type': 'application/json' };
    const fullData = { steamid, nickname: resolvedNickname, country, cached_at: new Date().toISOString(), user: {}, maps: mapsData };
    await Promise.all([
      // Write full JSON to player_cache — profile reads this instantly
      fetch(`${sbUrl}/rest/v1/player_cache`, {
        method: 'POST',
        headers: { ...sbH, Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ steamid, data: fullData, updated_at: new Date().toISOString() }),
      }).then(r => r.ok ? console.log(`Supabase: player_cache written for ${resolvedNickname}`) : r.text().then(t => console.warn(`Supabase player_cache failed: ${t}`))),
      // Write summary to players table — leaderboard reads this instantly
      fetch(`${sbUrl}/rest/v1/players`, {
        method: 'POST',
        headers: { ...sbH, Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({
          steamid, nickname: resolvedNickname, avatar: player.avatar || '', country,
          kz_points: Number(player.kz_points) || 0, kz_place: Number(player.kz_place) || 0,
          kz_maps: mapList.length, cached_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }),
      }).then(r => r.ok ? console.log(`Supabase: players synced for ${resolvedNickname}`) : r.text().then(t => console.warn(`Supabase players failed: ${t}`))),
    ]).catch(e => console.warn('Supabase early sync error:', e.message));
  }

  // Save individual cache file
  // NOTE: userData always returns the cookie-owner's stats, not the queried player's.
  // Save user: {} to prevent contamination. Stats come from mapsData.header.desc.
  fs.writeFileSync(
    path.join(cacheDir, `${steamid}.json`),
    JSON.stringify({ steamid, nickname: resolvedNickname, country, cached_at: new Date().toISOString(), user: {}, maps: mapsData }, null, 2)
  );
  console.log(`Saved cache/${steamid}.json`);

  // Remove player from any OTHER country file they may be in (prevents cross-file dupes)
  const allCountryFiles = fs.readdirSync(cacheDir).filter(f => f.endsWith('-kz-players.json') && f !== 'world-kz-players.json' && f !== `${country}-kz-players.json`);
  for (const cf of allCountryFiles) {
    const cfPath = path.join(cacheDir, cf);
    try {
      const d = JSON.parse(fs.readFileSync(cfPath, 'utf8'));
      const before = d.players.length;
      d.players = d.players.filter(p => p.steamid !== steamid);
      if (d.players.length !== before) {
        fs.writeFileSync(cfPath, JSON.stringify(d, null, 2));
        console.log(`Removed ${steamid} from ${cf}`);
      }
    } catch {}
  }

  // Merge into country leaderboard file
  const lbFile = getLeaderboardFile(country);
  let existing = [];
  if (fs.existsSync(lbFile)) {
    try { existing = JSON.parse(fs.readFileSync(lbFile, 'utf8')).players || []; } catch {}
  }

  const idx = existing.findIndex(p => p.steamid === steamid);
  if (idx !== -1) {
    existing[idx] = player;
    console.log(`Updated existing entry for ${resolvedNickname}`);
  } else {
    existing.push(player);
    console.log(`Added new entry for ${resolvedNickname}`);
  }

  existing.sort((a, b) => b.kz_points - a.kz_points);

  fs.writeFileSync(
    lbFile,
    JSON.stringify({ updated_at: new Date().toISOString(), players: existing }, null, 2)
  );

  // Normalize place_num totals: find max total per map and apply to all country files
  const countryFiles = fs.readdirSync(cacheDir).filter(f => f.endsWith('-kz-players.json') && f !== 'world-kz-players.json');
  const mapMaxTotal = {};
  for (const cf of countryFiles) {
    try {
      const players = JSON.parse(fs.readFileSync(path.join(cacheDir, cf), 'utf8')).players || [];
      for (const p of players) {
        for (const m of (p.maps_list || [])) {
          if (!m.place_num) continue;
          const clean = m.place_num.replace(/[ \s]/g, '');
          const parts = clean.split('/');
          if (parts.length < 2) continue;
          const total = parseInt(parts[1].replace(/\D/g, ''), 10) || 0;
          if (total > (mapMaxTotal[m.map] || 0)) mapMaxTotal[m.map] = total;
        }
      }
    } catch {}
  }
    function fmtNum(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
  for (const cf of countryFiles) {
    const cfPath = path.join(cacheDir, cf);
    try {
      const fileData = JSON.parse(fs.readFileSync(cfPath, 'utf8'));
      let changed = false;
      for (const p of (fileData.players || [])) {
        for (const m of (p.maps_list || [])) {
          const maxTotal = mapMaxTotal[m.map];
          if (!maxTotal || !m.place_num) continue;
          const clean = m.place_num.replace(/[ \s]/g, '');
          const parts = clean.split('/');
          if (parts.length < 2) continue;
          const rank = parseInt(parts[0].replace(/\D/g, ''), 10) || 0;
          const newPlace = `${fmtNum(rank)} / ${fmtNum(maxTotal)}`;
          if (m.place_num !== newPlace) { m.place_num = newPlace; changed = true; }
        }
      }
      if (changed) fs.writeFileSync(cfPath, JSON.stringify(fileData, null, 2));
    } catch {}
  }

  // Save map-totals.json — used by profile page to show correct totals for all players
  const totalsFile = path.join(cacheDir, 'map-totals.json');
  let existingTotals = {};
  try { existingTotals = JSON.parse(fs.readFileSync(totalsFile, 'utf8')); } catch {}
  let totalsMerged = { ...existingTotals };
  for (const [map, total] of Object.entries(mapMaxTotal)) {
    if (total > (totalsMerged[map] || 0)) totalsMerged[map] = total;
  }
  fs.writeFileSync(totalsFile, JSON.stringify(totalsMerged, null, 2));
  console.log(`Saved map-totals.json (${Object.keys(totalsMerged).length} maps)`);

  // Upsert map totals to Supabase `map_stats` table.
  // `totalsMerged` contains { mapName -> maxTotal } built from all country cache files,
  // so it always holds the highest known completion count per map across every tracked player.
  // The frontend reads `map_stats.total_completions` to display "Unique completions" on
  // the maps list page and map detail page — no guessing from place_num strings needed.
  //
  // Supabase table required (run once in SQL Editor):
  //   CREATE TABLE IF NOT EXISTS map_stats (
  //     map               TEXT PRIMARY KEY,
  //     total_completions INT  NOT NULL DEFAULT 0,
  //     updated_at        TIMESTAMPTZ DEFAULT NOW()
  //   );
  if (sbUrl && sbKey && Object.keys(totalsMerged).length) {
    const sbH2 = { apikey: sbKey, Authorization: `Bearer ${sbKey}`, 'Content-Type': 'application/json' };
    const batch = Object.entries(totalsMerged).map(([map, total]) => ({ map, total_completions: total }));
    for (let i = 0; i < batch.length; i += 500) {
      await fetch(`${sbUrl}/rest/v1/map_stats`, {
        method: 'POST',
        headers: { ...sbH2, Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(batch.slice(i, i + 500)),
      }).then(r => r.ok ? null : r.text().then(t => console.warn(`map_stats upsert failed: ${t}`))).catch(e => console.warn('map_stats upsert error:', e.message));
    }
    console.log(`Upserted ${batch.length} map totals to Supabase map_stats`);
  }

  // Apply normalized place_num back to individual cache file + mapsData in memory
  if (Object.keys(mapMaxTotal).length) {
    for (const m of (mapsData?.list || [])) {
      const maxTotal = mapMaxTotal[m.map];
      if (!maxTotal || !m.place_num) continue;
      const clean = m.place_num.replace(/[ \s]/g, '');
      const parts = clean.split('/');
      if (parts.length < 2) continue;
      const rank = parseInt(parts[0].replace(/\D/g, ''), 10) || 0;
      m.place_num = `${fmtNum(rank)} / ${fmtNum(maxTotal)}`;
    }
    // Re-write individual cache file with normalized totals
    fs.writeFileSync(
      path.join(cacheDir, `${steamid}.json`),
      JSON.stringify({ steamid, nickname: resolvedNickname, country, cached_at: new Date().toISOString(), user: {}, maps: mapsData }, null, 2)
    );
    console.log(`Updated cache/${steamid}.json with normalized place_num`);
  }

  // Rebuild world leaderboard from all country files (never incremental — avoids corruption)
  const worldFile = path.join(cacheDir, 'world-kz-players.json');
  const seen = new Set();
  const worldPlayers = [];
  for (const cf of countryFiles) {
    try {
      const players = JSON.parse(fs.readFileSync(path.join(cacheDir, cf), 'utf8')).players || [];
      for (const p of players) {
        if (!seen.has(p.steamid)) { seen.add(p.steamid); worldPlayers.push(p); }
      }
    } catch {}
  }
  worldPlayers.sort((a, b) => b.kz_points - a.kz_points);
  fs.writeFileSync(worldFile, Buffer.from(JSON.stringify({ updated_at: new Date().toISOString(), players: worldPlayers }, null, 2), 'utf8'));
  console.log(`World rebuilt: ${worldPlayers.length} players`);

  console.log(`Done! ${resolvedNickname} — ${mapList.length} maps, ${player.kz_points} pts, rank #${player.kz_place}`);
  // player_cache cleaned up by Supabase cron every 5 min (rows older than 10 min)
})();

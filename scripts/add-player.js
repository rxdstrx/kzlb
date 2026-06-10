const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const chromium = require('@sparticuz/chromium');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

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
  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: true,
  });

  const page = await browser.newPage();

  const cookies = COOKIE.split('; ').map(c => {
    const [name, ...rest] = c.split('=');
    return { name, value: rest.join('='), domain: 'cybershoke.net' };
  });
  await page.setCookie(...cookies);
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'ru-RU,ru;q=0.9' });

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

  console.log('Getting cybershoke session...');
  await page.goto('https://cybershoke.net/', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 2000));

  console.log(`Fetching KZ stats for ${steamid} (country: ${country})...`);

  const { userData, mapsData } = await page.evaluate(async (sid) => {
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/plain, */*',
      'Origin': 'https://cybershoke.net',
      'Referer': `https://cybershoke.net/ru/cs2/leaderboard/kz/maps/${sid}`,
    };
    const body = JSON.stringify({
      mode: 18, season: 0, only_friends: false, only_pro: false,
      id_games: '2', map: null, category: null,
      steamid64: sid, sub_type: 0, type: 1,
    });

    const [uRes, mRes] = await Promise.all([
      fetch('https://cybershoke.net/api/api/v1/leaderboard/user', { method: 'POST', headers, body }),
      fetch('https://cybershoke.net/api/api/v2/leaderboard/data', { method: 'POST', headers, body }),
    ]);

    return {
      userData: await uRes.json().catch(() => ({})),
      mapsData: await mRes.json().catch(() => ({})),
    };
  }, steamid);

  await browser.close();

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
    resolvedNickname = mapsData?.header?.name || steamid;
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
    avatar: mapsData?.header?.avatar || '',
    maps_list: mapList,
  };

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

  // ── Sync to Supabase ──
  const sbUrl = process.env.SUPABASE_URL;
  const sbKey = process.env.SUPABASE_SERVICE_KEY;
  if (sbUrl && sbKey) {
    const sbH = {
      apikey: sbKey, Authorization: `Bearer ${sbKey}`,
      'Content-Type': 'application/json',
    };

    // 1. Write full profile JSON to player_cache immediately
    //    Profile page reads this first — instant update, no CDN delay
    try {
      const fullData = { steamid, nickname: resolvedNickname, country, cached_at: new Date().toISOString(), user: {}, maps: mapsData };
      const cr = await fetch(`${sbUrl}/rest/v1/player_cache`, {
        method: 'POST',
        headers: { ...sbH, Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ steamid, data: fullData, updated_at: new Date().toISOString() }),
      });
      if (cr.ok) console.log(`Supabase: player_cache written for ${resolvedNickname}`);
      else console.warn(`Supabase player_cache write failed: ${cr.status} ${await cr.text()}`);
    } catch (e) { console.warn('Supabase player_cache error:', e.message); }

    // 2. Sync leaderboard summary to players table
    try {
      const sbRow = {
        steamid:   player.steamid,
        nickname:  player.nickname  || resolvedNickname || '',
        avatar:    player.avatar    || '',
        country:   player.country   || country || 'xx',
        kz_points: Number(player.kz_points) || 0,
        kz_place:  Number(player.kz_place)  || 0,
        kz_maps:   mapList.length,
        cached_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const r = await fetch(`${sbUrl}/rest/v1/players`, {
        method: 'POST',
        headers: { ...sbH, Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(sbRow),
      });
      if (r.ok) console.log(`Supabase: players synced for ${resolvedNickname}`);
      else console.warn(`Supabase players sync failed: ${r.status} ${await r.text()}`);
    } catch (e) { console.warn('Supabase players sync error:', e.message); }

    // 3. Delete from player_cache — GitHub file is now committed, CDN will serve it
    //    player_cache was only needed to bridge the CDN delay window
    try {
      const dr = await fetch(`${sbUrl}/rest/v1/player_cache?steamid=eq.${steamid}`, {
        method: 'DELETE',
        headers: { ...sbH, Prefer: 'return=minimal' },
      });
      if (dr.ok) console.log(`Supabase: player_cache cleaned up for ${steamid}`);
      else console.warn(`Supabase player_cache delete failed: ${dr.status}`);
    } catch (e) { console.warn('Supabase player_cache delete error:', e.message); }
  }
})();

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

// ── Sync to Supabase (instant leaderboard updates) ──
async function syncToSupabase(allPlayers) {
  const sbUrl = process.env.SUPABASE_URL;
  const sbKey = process.env.SUPABASE_SERVICE_KEY;
  if (!sbUrl || !sbKey) { console.log('SUPABASE_URL/SUPABASE_SERVICE_KEY not set — skipping Supabase sync'); return; }

  const headers = {
    apikey: sbKey,
    Authorization: `Bearer ${sbKey}`,
    'Content-Type': 'application/json',
    Prefer: 'resolution=merge-duplicates,return=minimal',
  };

  const rows = allPlayers.map(p => ({
    steamid:   p.steamid,
    nickname:  p.nickname  || '',
    avatar:    p.avatar    || '',
    country:   p.country   || 'xx',
    kz_points: Number(p.kz_points) || 0,
    kz_place:  Number(p.kz_place)  || 0,
    kz_maps:   Number(p.kz_maps)   || (p.maps_list?.length) || 0,
    cached_at: p.cached_at || new Date().toISOString(),
    // NOTE: deliberately do NOT set updated_at here. The bulk world-rebuild must
    // preserve each player's real last-update time so (a) the homepage can fetch
    // only players changed since the cache was built, and (b) the update cooldown
    // isn't reset for everyone on every rebuild. Real updates (scrape-player,
    // register-player) set updated_at themselves.
  }));

  // Batch upsert in chunks of 500
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const res = await fetch(`${sbUrl}/rest/v1/players`, {
      method: 'POST',
      headers,
      body: JSON.stringify(chunk),
    });
    if (!res.ok) {
      console.warn(`Supabase upsert chunk ${i}-${i+CHUNK} failed: ${res.status} ${await res.text()}`);
    } else {
      console.log(`Supabase: synced players ${i+1}–${Math.min(i+CHUNK, rows.length)}`);
    }
  }
  console.log(`Supabase sync complete — ${rows.length} players`);
}

syncToSupabase(players).catch(e => console.warn('Supabase sync error:', e.message));

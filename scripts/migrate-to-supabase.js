// One-time migration: reads all cache files and upserts to Supabase players table
// Run via GitHub Action or locally: node scripts/migrate-to-supabase.js

const fs   = require('fs');
const path = require('path');

const sbUrl = process.env.SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_KEY;

if (!sbUrl || !sbKey) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY env vars');
  process.exit(1);
}

const cacheDir = path.join(__dirname, '..', 'cache');
const seen = new Set();
const players = [];

const files = fs.readdirSync(cacheDir)
  .filter(f => f.endsWith('-kz-players.json') && f !== 'world-kz-players.json');

for (const file of files) {
  try {
    let raw = fs.readFileSync(path.join(cacheDir, file), 'utf8');
    if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
    const data = JSON.parse(raw);
    for (const p of (data.players || [])) {
      if (!seen.has(p.steamid)) {
        seen.add(p.steamid);
        players.push({
          steamid:   p.steamid,
          nickname:  p.nickname  || '',
          avatar:    p.avatar    || '',
          country:   p.country   || 'xx',
          kz_points: Number(p.kz_points) || 0,
          kz_place:  Number(p.kz_place)  || 0,
          kz_maps:   Number(p.kz_maps)   || (p.maps_list?.length) || 0,
          cached_at: p.cached_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    }
  } catch (e) {
    console.warn(`Skipped ${file}: ${e.message}`);
  }
}

console.log(`Found ${players.length} unique players. Uploading to Supabase...`);

const headers = {
  apikey: sbKey,
  Authorization: `Bearer ${sbKey}`,
  'Content-Type': 'application/json',
  Prefer: 'resolution=merge-duplicates,return=minimal',
};

const CHUNK = 500;
(async () => {
  for (let i = 0; i < players.length; i += CHUNK) {
    const chunk = players.slice(i, i + CHUNK);
    const res = await fetch(`${sbUrl}/rest/v1/players`, {
      method: 'POST',
      headers,
      body: JSON.stringify(chunk),
    });
    if (!res.ok) {
      console.error(`Chunk ${i}-${i+CHUNK} failed: ${res.status} ${await res.text()}`);
    } else {
      console.log(`Migrated players ${i+1}–${Math.min(i+CHUNK, players.length)}`);
    }
  }
  console.log('Migration complete!');
})();

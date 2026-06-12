// Syncs the "TOP 100" role in Supabase to match the current world leaderboard.
// Adds the role to anyone who entered top 100, removes it from anyone who fell out.
const fs = require('fs');

const SB_URL  = process.env.SUPABASE_URL;
const SB_KEY  = process.env.SUPABASE_SERVICE_KEY;
const ROLE    = 'TOP 100';
const TOP_N   = 99; // TEMP: set back to 100 after testing

if (!SB_URL || !SB_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const H = {
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=minimal',
};

async function main() {
  // 1. Read world cache and determine current top N by kz_points
  const raw     = JSON.parse(fs.readFileSync('cache/world-kz-players.json', 'utf8'));
  const players = raw.players || raw; // handle both {players:[]} and flat []
  const sorted  = [...players].sort((a, b) => (Number(b.kz_points) || 0) - (Number(a.kz_points) || 0));
  const newTop  = new Set(sorted.slice(0, TOP_N).map(p => p.steamid));

  console.log(`World cache has ${players.length} players. Top ${TOP_N} determined.`);
  console.log(`#1: ${sorted[0]?.nickname} (${sorted[0]?.kz_points} pts)  #${TOP_N}: ${sorted[TOP_N - 1]?.nickname} (${sorted[TOP_N - 1]?.kz_points} pts)`);

  // 2. Ensure the TOP 100 role exists (gold crown)
  await fetch(`${SB_URL}/rest/v1/roles`, {
    method: 'POST',
    headers: { ...H, Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify({ name: ROLE, color: '#fbbf24', icon: '👑' }),
  });

  // 3. Fetch all current holders of the TOP 100 role
  const curRes = await fetch(
    `${SB_URL}/rest/v1/player_roles?role=eq.${encodeURIComponent(ROLE)}&select=steamid`,
    { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
  );
  const curRows   = curRes.ok ? await curRes.json() : [];
  const currentTop = new Set(curRows.map(r => r.steamid));

  // 4. Diff
  const toAdd    = [...newTop].filter(id => !currentTop.has(id));
  const toRemove = [...currentTop].filter(id => !newTop.has(id));

  console.log(`Changes — add: ${toAdd.length}, remove: ${toRemove.length}`);

  // 5. Assign to new entrants
  for (const steamid of toAdd) {
    const r = await fetch(`${SB_URL}/rest/v1/player_roles`, {
      method: 'POST',
      headers: { ...H, Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify({ steamid, role: ROLE }),
    });
    const ok = r.status === 200 || r.status === 201 || r.status === 204;
    console.log(`${ok ? '+' : '!'} ${steamid}${ok ? '' : ' — ' + await r.text()}`);
  }

  // 6. Remove from players who fell out
  for (const steamid of toRemove) {
    const r = await fetch(
      `${SB_URL}/rest/v1/player_roles?steamid=eq.${steamid}&role=eq.${encodeURIComponent(ROLE)}`,
      { method: 'DELETE', headers: H }
    );
    const ok = r.status === 200 || r.status === 204;
    console.log(`${ok ? '-' : '!'} ${steamid}${ok ? '' : ' — ' + await r.text()}`);
  }

  console.log('Sync complete.');
}

main().catch(e => { console.error(e); process.exit(1); });

// Syncs the "TOP 100" role in Supabase to match the current world leaderboard.
// Adds the role to anyone who entered top 100, removes it from anyone who fell out.
// Reads live data directly from Supabase (not stale GitHub cache).

const SB_URL  = process.env.SUPABASE_URL;
const SB_KEY  = process.env.SUPABASE_SERVICE_KEY;
const ROLE    = 'TOP 100';
const TOP_N   = 100;

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
  // 1. Fetch top N directly from Supabase (always fresh, not stale cache)
  const sbRes = await fetch(
    `${SB_URL}/rest/v1/players?select=steamid,nickname,kz_points&order=kz_points.desc&limit=${TOP_N}`,
    { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
  );
  if (!sbRes.ok) {
    console.error('Failed to fetch players from Supabase:', await sbRes.text());
    process.exit(1);
  }
  const players = await sbRes.json();
  const newTop  = new Set(players.slice(0, TOP_N).map(p => String(p.steamid)));

  console.log(`Supabase returned ${players.length} players. Top ${TOP_N} determined.`);
  if (players[0])           console.log(`#1: ${players[0].nickname} (${players[0].kz_points} pts)`);
  if (players[TOP_N - 1])  console.log(`#${TOP_N}: ${players[TOP_N - 1].nickname} (${players[TOP_N - 1].kz_points} pts)`);

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
  const currentTop = new Set(curRows.map(r => String(r.steamid)));

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

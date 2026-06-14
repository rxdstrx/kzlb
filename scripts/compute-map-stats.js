const fs   = require('fs');
const path = require('path');

const sbUrl = process.env.SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_KEY;

function timeToSec(t) {
  if (!t) return Infinity;
  t = String(t).trim();
  const p = t.split(':');
  try {
    if (p.length === 3) return Math.abs(parseInt(p[0])) * 3600 + parseInt(p[1]) * 60 + parseFloat(p[2]);
    if (p.length === 2) return parseInt(p[0]) * 60 + parseFloat(p[1]);
  } catch {}
  return parseFloat(t);
}

async function fetchAll(url) {
  const PAGE = 1000;
  let offset = 0, rows = [];
  while (true) {
    const sep = url.includes('?') ? '&' : '?';
    const r = await fetch(`${url}${sep}limit=${PAGE}&offset=${offset}`, {
      headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` },
    });
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    const batch = await r.json();
    rows = rows.concat(batch);
    process.stdout.write(`\r  ${rows.length} rows fetched...`);
    if (batch.length < PAGE) break;
    offset += PAGE;
  }
  console.log('');
  return rows;
}

async function main() {
  if (!sbUrl || !sbKey) { console.error('SUPABASE_URL/SUPABASE_SERVICE_KEY not set'); process.exit(1); }

  console.log('Fetching player_maps from Supabase...');
  const allRows = await fetchAll(`${sbUrl}/rest/v1/player_maps?select=map,time_record,place_num`);
  console.log(`Total: ${allRows.length} rows`);

  const stats = new Map();
  for (const row of allRows) {
    if (!row.map) continue;
    if (!stats.has(row.map)) stats.set(row.map, { record: null, recordSec: Infinity, completions: 0, timeSum: 0, timeCount: 0 });
    const s = stats.get(row.map);
    const sec = timeToSec(row.time_record);
    if (isFinite(sec)) {
      s.timeSum += sec;
      s.timeCount++;
      if (sec < s.recordSec) { s.recordSec = sec; s.record = row.time_record; }
    }
    const clean = (row.place_num || '').replace(/[\s ]/g, '');
    const m = clean.match(/^(\d+)\/(\d+)$/);
    if (m) { const tot = parseInt(m[2], 10); if (tot > s.completions) s.completions = tot; }
  }

  const maps = {};
  for (const [map, s] of stats) {
    maps[map] = {
      completions: s.completions,
      record: s.record,
      avg: s.timeCount > 0 ? s.timeSum / s.timeCount : null,
    };
  }

  const outPath = path.join(__dirname, '..', 'cache', 'map-stats.json');
  fs.writeFileSync(outPath, Buffer.from(JSON.stringify({ updated_at: new Date().toISOString(), maps }, null, 2), 'utf8'));
  console.log(`Done — ${Object.keys(maps).length} maps written to cache/map-stats.json`);
}

main().catch(e => { console.error(e.message); process.exit(1); });

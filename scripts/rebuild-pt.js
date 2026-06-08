// Rebuilds pt-kz-players.json (and world) from individual steamid cache files
// to eliminate encoding corruption introduced by PowerShell
const fs   = require('fs');
const path = require('path');

const cacheDir = path.join(__dirname, '..', 'cache');

function readJSON(file) {
  let raw = fs.readFileSync(file, 'utf8');
  if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
  return JSON.parse(raw);
}

// Clean any mojibake: Â  → regular space,   → regular space
function cleanStr(s) {
  if (typeof s !== 'string') return s;
  return s.replace(/Â /g, ' ').replace(/ /g, ' ');
}

function cleanPlayer(p) {
  const cleaned = { ...p };
  if (Array.isArray(p.maps_list)) {
    cleaned.maps_list = p.maps_list.map(m => {
      const cm = { ...m };
      if (cm.place_num) cm.place_num = cleanStr(cm.place_num);
      if (cm.time_record) cm.time_record = cleanStr(cm.time_record);
      return cm;
    });
  }
  return cleaned;
}

// Read existing pt list (just to get the list of steamids + metadata)
const ptRaw = readJSON(path.join(cacheDir, 'pt-kz-players.json'));
const ptPlayers = ptRaw.players || [];

// For each PT player, re-read their individual cache file if it exists
const rebuilt = [];
for (const p of ptPlayers) {
  const indFile = path.join(cacheDir, `${p.steamid}.json`);
  if (fs.existsSync(indFile)) {
    try {
      const ind = readJSON(indFile);
      const header  = ind.maps?.header || {};
      const desc    = header.desc || {};
      const mapList = (ind.maps?.list || []).map(m => {
        const cm = { ...m };
        if (cm.place_num) cm.place_num = cleanStr(cm.place_num);
        if (cm.time_record) cm.time_record = cleanStr(cm.time_record);
        return cm;
      });

      rebuilt.push({
        steamid:   p.steamid,
        nickname:  header.title || p.nickname,
        country:   ind.country || p.country || 'pt',
        cached_at: ind.cached_at || p.cached_at,
        kz_points: desc['{{Points}}'] ?? p.kz_points ?? 0,
        kz_place:  desc['{{Position}}'] ?? p.kz_place ?? 0,
        kz_maps:   desc['{{COMPLETIONS-MAP}}'] ?? p.kz_maps ?? '0',
        avatar:    header.avatar || p.avatar || '',
        maps_list: mapList,
      });
      continue;
    } catch (e) {
      console.warn(`Could not read ${p.steamid}.json: ${e.message}`);
    }
  }
  // Fallback: use existing data but clean strings
  rebuilt.push(cleanPlayer(p));
}

rebuilt.sort((a, b) => b.kz_points - a.kz_points);

fs.writeFileSync(
  path.join(cacheDir, 'pt-kz-players.json'),
  Buffer.from(JSON.stringify({ updated_at: new Date().toISOString(), players: rebuilt }, null, 2), 'utf8')
);
console.log(`pt-kz-players.json: ${rebuilt.length} players`);

// Now rebuild world
const { execSync } = require('child_process');
execSync(`"C:\\Program Files\\nodejs\\node.exe" "${path.join(__dirname, 'rebuild-world.js')}"`, { stdio: 'inherit' });

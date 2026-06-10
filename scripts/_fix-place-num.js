// Fix double-encoded non-breaking spaces in place_num across all cache files
const fs = require('fs');
const path = require('path');

const cacheDir = path.join(__dirname, '..', 'cache');
const files = fs.readdirSync(cacheDir).filter(f => f.endsWith('.json'));

let fixed = 0;
const DOUBLE_NBSP = /Â /g;
const NBSP = / /g;

function cleanPos(s) {
  return (s || '').replace(DOUBLE_NBSP, ' ').replace(NBSP, ' ').trim();
}

files.forEach(f => {
  const fPath = path.join(cacheDir, f);
  try {
    const raw = fs.readFileSync(fPath, 'utf8').replace(/^﻿/, '');
    const data = JSON.parse(raw);

    let changed = false;

    // Individual player cache: maps.list
    if (data.maps && Array.isArray(data.maps.list)) {
      data.maps.list.forEach(entry => {
        if (entry.place_num) {
          const cleaned = cleanPos(entry.place_num);
          if (cleaned !== entry.place_num) { entry.place_num = cleaned; changed = true; }
        }
      });
    }

    // Country/world cache: players[].maps_list
    if (Array.isArray(data.players)) {
      data.players.forEach(p => {
        (p.maps_list || []).forEach(entry => {
          if (entry.place_num) {
            const cleaned = cleanPos(entry.place_num);
            if (cleaned !== entry.place_num) { entry.place_num = cleaned; changed = true; }
          }
        });
      });
    }

    if (changed) {
      fs.writeFileSync(fPath, Buffer.from(JSON.stringify(data, null, 2), 'utf8'));
      fixed++;
    }
  } catch {}
});

console.log(`Fixed ${fixed} / ${files.length} files`);

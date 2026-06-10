const fs = require('fs');
let content = fs.readFileSync('scripts/scrape.js', 'utf8');

// Replace the normalize block entirely with proper unicode-escaped version
const newBlock = `  // Normalize place_num: fix double-UTF-8 non-breaking space encoding
  if (mapsData && mapsData.list) {
    mapsData.list = mapsData.list.map(function(entry) {
      var pos = (entry.place_num || '');
      // Replace double-encoded NBSP (\\u00c2\\u00a0) then plain NBSP (\\u00a0)
      pos = pos.replace(/\\u00c2\\u00a0/g, ' ').replace(/\\u00a0/g, ' ').trim();
      return Object.assign({}, entry, { place_num: pos });
    });
  }`;

content = content.replace(/\/\/ Normalize place_num[\s\S]*?}\s*\n/, newBlock + '\n');
fs.writeFileSync('scripts/scrape.js', content, 'utf8');
console.log('done');
const lines = content.split('\n');
const idx = lines.findIndex(l => l.includes('Normalize place_num'));
console.log(lines.slice(idx, idx+8).join('\n'));

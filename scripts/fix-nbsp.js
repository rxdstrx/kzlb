// Replace broken place_num .replace() calls with proper   unicode escape
const fs = require('fs');
const path = require('path');

const files = ['script.js', 'portugal.js', 'country.js', 'map.js', 'profile.js'].map(f => path.join(__dirname, '..', f));

for (const f of files) {
  let c = fs.readFileSync(f, 'utf8');
  // Match any .replace(/.../g, ' ') where the regex contains something that might be nbsp or space
  // Replace with explicit   version
  const updated = c
    .replace(/\(p\.entry\.place_num \|\| ''\)\.replace\([^)]+\)/g,
      "(p.entry.place_num || '').replace(/\\u00a0/g, ' ')")
    .replace(/\(r\.place_num \|\| ''\)\.replace\([^)]+\)/g,
      "(r.place_num || '').replace(/\\u00a0/g, ' ')")
    .replace(/\(row\.place_num \?\? '—'\)\.replace\([^)]+\)/g,
      "(row.place_num ?? '—').replace(/\\u00a0/g, ' ')");

  if (updated !== c) {
    fs.writeFileSync(f, updated, 'utf8');
    console.log('Fixed:', path.basename(f));
  } else {
    console.log('No change:', path.basename(f));
  }
}

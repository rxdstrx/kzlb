// Strips BOM from all cache JSON files and re-saves them cleanly
const fs   = require('fs');
const path = require('path');

const cacheDir = path.join(__dirname, '..', 'cache');
const files = fs.readdirSync(cacheDir).filter(f => f.endsWith('.json'));

let fixed = 0;
for (const file of files) {
  const filePath = path.join(cacheDir, file);
  let raw = fs.readFileSync(filePath, 'utf8');
  if (raw.charCodeAt(0) === 0xFEFF) {
    raw = raw.slice(1);
    // Re-parse and re-write with 2-space indent (also normalises PowerShell's verbose indentation)
    try {
      const parsed = JSON.parse(raw);
      fs.writeFileSync(filePath, Buffer.from(JSON.stringify(parsed, null, 2), 'utf8'));
      console.log(`Fixed: ${file}`);
      fixed++;
    } catch (e) {
      console.warn(`Could not rewrite ${file}: ${e.message}`);
    }
  }
}
console.log(`\nFixed ${fixed} files.`);

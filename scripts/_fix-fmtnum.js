const fs = require('fs');
let c = fs.readFileSync('scripts/add-player.js', 'utf8');
// Replace the fmtNum function — handles nbsp inside the file
c = c.replace(/function fmtNum\(n\) \{[^\n]+\n/, "  function fmtNum(n) { return String(n).replace(/\\B(?=(\\d{3})+(?!\\d))/g, ' '); }\n");
fs.writeFileSync('scripts/add-player.js', c, 'utf8');
const m = c.match(/fmtNum[^\n]+/);
console.log(m ? m[0] : 'not found');

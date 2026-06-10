const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));

// Country pages have window.COUNTRY_CODE set
const CSS_LINE = '  <link rel="stylesheet" href="friends.css" />';
const SCRIPTS = `  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
  <script src="supabase-client.js"></script>
  <script src="friends.js"></script>`;

let updated = 0;

for (const f of files) {
  const fPath = path.join(dir, f);
  let html = fs.readFileSync(fPath, 'utf8');

  // Only process country pages (have COUNTRY_CODE) — skip already-updated pages
  if (!html.includes('window.COUNTRY_CODE')) continue;
  if (html.includes('friends.css')) continue;

  // Add CSS before </head>
  html = html.replace('</head>', `${CSS_LINE}\n</head>`);

  // Add scripts before </body>
  html = html.replace('</body>', `${SCRIPTS}\n</body>`);

  fs.writeFileSync(fPath, html, 'utf8');
  updated++;
  console.log(`Updated ${f}`);
}

console.log(`Done — ${updated} country pages updated.`);

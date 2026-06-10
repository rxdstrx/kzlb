// Fix all place_num display .replace() calls to handle double-encoded NBSP
const fs = require('fs');
const files = ['profile.js', 'map.js', 'country.js', 'portugal.js', 'script.js'];

files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');
  const before = content;

  // Replace any .replace() call on place_num that handles NBSP (either form)
  // Pattern 1: .replace(/ /g, ' ')
  content = content.replace(/\.replace\(\/\\u00a0\/g,\s*' '\)/g, ".replace(/\\u00c2\\u00a0|\\u00a0/g, ' ')");

  // Pattern 2: literal NBSP in regex — the hex c2a0 byte sequence in a /…/g
  // We detect this by looking for .replace(/ /g, ' ') where the space is a NBSP
  // Use a buffer comparison to find literal NBSP in regex patterns
  const NBSP = ' ';
  const badPattern = `.replace(/${NBSP}/g, ' ')`;
  const goodReplacement = ".replace(/\\u00c2\\u00a0|\\u00a0/g, ' ')";
  while (content.includes(badPattern)) {
    content = content.replace(badPattern, goodReplacement);
  }

  if (content !== before) {
    fs.writeFileSync(f, content, 'utf8');
    console.log('Fixed:', f);
  } else {
    console.log('No change:', f);
  }
});

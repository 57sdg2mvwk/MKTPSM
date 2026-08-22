const fs = require('fs');
let code = fs.readFileSync('artifacts/amd-marketing-panel/src/App.tsx', 'utf-8');

// Replace className string literals right after `<input `
// We'll just find `<input` and then use regex to find its `className="..."`
let chunks = code.split('<input ');
for (let i = 1; i < chunks.length; i++) {
  // chunks[i] starts right after `<input `.
  // Let's replace the first `className="..."` in it.
  chunks[i] = chunks[i].replace(/className="([^"]*)"/, (match, classes) => {
    return `className="${classes.replace(/\buppercase\b/g, '').trim()}"`;
  });
}
code = chunks.join('<input ');

fs.writeFileSync('artifacts/amd-marketing-panel/src/App.tsx', code);

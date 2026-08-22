const fs = require('fs');
let code = fs.readFileSync('artifacts/amd-marketing-panel/src/App.tsx', 'utf-8');

// The link is inside a span next to Link2:
code = code.replace(/<span className="truncate uppercase">\{order\.link\}<\/span>/g, '<span className="truncate">{order.link}</span>');

fs.writeFileSync('artifacts/amd-marketing-panel/src/App.tsx', code);

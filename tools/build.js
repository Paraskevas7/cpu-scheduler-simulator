// Copies the engine to docs/ so the web page can load it. CI checks that the copy is up to date.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
fs.copyFileSync(path.join(root, 'src', 'scheduler.js'), path.join(root, 'docs', 'scheduler.js'));
console.log('copied src/scheduler.js to docs/scheduler.js');

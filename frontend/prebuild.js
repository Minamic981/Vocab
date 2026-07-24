import { readFileSync, writeFileSync } from 'fs';

const v = Date.now();
const files = [
  'src/web/index.html',
  'src/mobile/mobile.html'
];

for (const file of files) {
  let html = readFileSync(file, 'utf8');
  // Strip any existing ?v=... then add fresh one
  html = html.replace(/(src="[^"]+\.jsx)\?v=\d+"/g, '$1');
  html = html.replace(/(src="[^"]+\.jsx)"/g, `$1?v=${v}"`);
  writeFileSync(file, html);
  console.log(`Stamped ${file} with ?v=${v}`);
}

// Copies the production build into the installed extension and touches the
// reload marker, so the running extension restarts the extension host
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const { publisher, name, version } = JSON.parse(
  fs.readFileSync('package.json', 'utf8'),
);
const target = path.join(
  os.homedir(),
  '.vscode',
  'extensions',
  `${publisher}.${name}-${version}`,
);

if (!fs.existsSync(target)) {
  console.error(`${target} not found, run npm run install-local first`);
  process.exit(1);
}

for (const file of [
  'package.json',
  'dist/extension.js',
  'dist/webview.js',
  'dist/webview.css',
]) {
  fs.copyFileSync(file, path.join(target, file));
}
fs.writeFileSync(path.join(target, '.dev-reload'), new Date().toISOString());
console.log(`Deployed to ${target}`);

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';

const bump = process.argv[2] ?? 'major';

const run = (command, args) =>
  execFileSync(command, args, { stdio: 'inherit' });

const changes = execFileSync(
  'git',
  ['status', '--porcelain', '--untracked-files=no'],
  {
    encoding: 'utf8',
  },
);
if (changes) {
  console.error('Commit or stash your changes before releasing.');
  process.exit(1);
}

run('git', ['fetch', 'origin']);
const behind = execFileSync(
  'git',
  ['rev-list', '--count', 'HEAD..@{upstream}'],
  { encoding: 'utf8' },
);
if (Number(behind) > 0) {
  console.error('Pull the commits on the remote before releasing.');
  process.exit(1);
}

run(process.execPath, [
  process.env.npm_execpath,
  'version',
  bump,
  '--no-git-tag-version',
]);
const { version } = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const tag = `v${version}`;

run('git', ['add', 'package.json', 'package-lock.json']);
run('git', ['commit', '-m', `chore(release): ${version}`]);
run('git', ['tag', '-a', tag, '-m', version]);
try {
  run('git', ['push', '--atomic', 'origin', 'HEAD', tag]);
} catch {
  run('git', ['tag', '-d', tag]);
  run('git', ['reset', '--keep', 'HEAD~1']);
  console.error(`Pushing failed, so the ${version} commit and tag are undone.`);
  process.exit(1);
}

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';

const bump = process.argv[2] ?? 'major';

const run = (command: string, args: readonly string[]) =>
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

const branch = execFileSync('git', ['branch', '--show-current'], {
  encoding: 'utf8',
}).trim();
if (branch !== 'main') {
  console.error('Switch to the main branch before releasing.');
  process.exit(1);
}

run('git', ['fetch', 'origin']);
const behind = execFileSync(
  'git',
  ['rev-list', '--count', 'HEAD..refs/remotes/origin/main'],
  { encoding: 'utf8' },
);
if (Number(behind) > 0) {
  console.error('Pull the commits on the remote before releasing.');
  process.exit(1);
}

const npm = process.env.npm_execpath;
if (!npm) {
  console.error('Release with npm run release, which tells it where npm is.');
  process.exit(1);
}

const files = ['package.json', 'package-lock.json'];
const undos = [() => run('git', ['checkout', 'HEAD', '--', ...files])];
try {
  run(process.execPath, [npm, 'version', bump, '--no-git-tag-version']);
  const { version } = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const tag = `v${version}`;
  run('git', ['add', ...files]);
  run('git', ['commit', '-m', `chore(release): ${version}`]);
  undos.push(() => run('git', ['reset', '--keep', 'HEAD~1']));
  run('git', ['tag', '-a', tag, '-m', version]);
  undos.push(() => run('git', ['tag', '-d', tag]));
  run('git', ['push', '--atomic', 'origin', 'HEAD:refs/heads/main', tag]);
  console.log(
    `Pushed ${tag}. GitHub Actions builds its installers into a draft release, which installed apps update to once you publish it.`,
  );
} catch {
  for (const undo of undos.toReversed()) {
    undo();
  }
  console.error(
    'Releasing failed, so its version bump, commit and tag are undone.',
  );
  process.exit(1);
}

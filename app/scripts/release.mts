import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import { ghCli, inFailedJobs, runOfRelease, watchRun } from './ciRun.mts';

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
let pushed: { readonly tag: string; readonly commit: string };
try {
  run(process.execPath, [npm, 'version', bump, '--no-git-tag-version']);
  const { version } = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const tag = `v${version}`;
  run('git', ['add', ...files]);
  run('git', ['commit', '-m', `chore(release): ${version}`]);
  undos.push(() => run('git', ['reset', '--keep', 'HEAD~1']));
  run('git', ['tag', '-a', tag, '-m', version]);
  undos.push(() => run('git', ['tag', '-d', tag]));
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  run('git', ['push', '--atomic', 'origin', 'HEAD:refs/heads/main', tag]);
  pushed = { tag, commit };
} catch {
  for (const undo of undos.toReversed()) {
    undo();
  }
  console.error(
    'Releasing failed, so its version bump, commit and tag are undone.',
  );
  process.exit(1);
}

const { tag, commit } = pushed;
console.log(
  `Pushed ${tag}. GitHub Actions checks it, builds its installers into a draft release and publishes it once everything passes, so installed apps update to it; this waits for that run, which goes on if the wait is stopped.`,
);

const watched = await watchRun(ghCli, () => runOfRelease(ghCli, commit, tag));
switch (watched.ended) {
  case 'passed':
    console.log(
      `Released ${tag}, which installed apps update to: ${watched.run.url}`,
    );
    process.exit(0);
  case 'failed':
    console.error(
      `The release run of ${tag} ended as ${watched.run.conclusion}${inFailedJobs(watched.failedJobs)}, so ${tag} is not published: ${watched.run.url}\nRead the log of the failed jobs with gh run view ${watched.run.databaseId} --log-failed; when they failed by chance, gh run rerun ${watched.run.databaseId} --failed runs them again and publishes ${tag} once they pass.`,
    );
    process.exit(1);
  case 'unwatched':
    console.error(
      `Pushed ${tag}, but could not watch its release run, as ${watched.why}: ${watched.said}\nThe run publishes ${tag} once everything passes; check it with gh run list --workflow release.yml --branch ${tag}.`,
    );
    process.exit(2);
  case 'missing':
    console.error(
      `Pushed ${tag}, but no release run started for it within 2 minutes. Look for it with gh run list --workflow release.yml.`,
    );
    process.exit(2);
  case 'unfinished':
    console.error(
      `The release run of ${tag} has not finished within an hour: ${watched.run.url}\nIt publishes ${tag} once everything passes; check it later with gh run view ${watched.run.databaseId} --exit-status.`,
    );
    process.exit(2);
}

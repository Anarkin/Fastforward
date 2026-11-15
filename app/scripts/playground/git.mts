import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { stream, write } from './gitImport.mts';
import { historyOfMain, pushedTags, readme, samples } from './gitHistory.mts';
import { branches } from './gitBranches.mts';

const flags = new Set(
  process.argv.slice(2).filter((arg) => arg.startsWith('--')),
);
const [given] = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const folder = path.resolve(
  given ?? path.join(import.meta.dirname, '..', '..', '..', '..'),
);
const sibling = (suffix: string) =>
  path.join(folder, `Fastforward-playground${suffix}`);
const local = sibling('');
const remote = sibling('-remote.git');
const worktree = sibling('-worktree');
const conflict = sibling('-conflict');
const rebasing = sibling('-rebasing');
const detached = sibling('-detached');
const shallow = sibling('-shallow');
const partial = sibling('-partial');
const empty = sibling('-empty');
const noRemote = sibling('-no-remote');
const upstream = sibling('-upstream.git');
const marker = 'fastforward.playground';

const identity = {
  GIT_AUTHOR_NAME: 'Playground',
  GIT_AUTHOR_EMAIL: 'playground@example.com',
  GIT_COMMITTER_NAME: 'Playground',
  GIT_COMMITTER_EMAIL: 'playground@example.com',
  GIT_AUTHOR_DATE: '2026-02-01T00:00:00Z',
  GIT_COMMITTER_DATE: '2026-02-01T00:00:00Z',
};

const git = (cwd: string, args: readonly string[], input?: string | Buffer) =>
  execFileSync('git', ['-c', 'core.safecrlf=false', ...args], {
    cwd,
    input,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, ...identity },
    stdio: ['pipe', 'pipe', 'inherit'],
  });

const realPath = (where: string) => {
  try {
    return fs.realpathSync.native(where);
  } catch {
    return path.resolve(where);
  }
};

const samePath = (a: string, b: string) =>
  path.relative(realPath(a), realPath(b)) === '';

const madeHere = (repository: string, commonDir: string) => {
  try {
    const common = path.resolve(
      repository,
      git(repository, ['rev-parse', '--git-common-dir']).trim(),
    );
    return (
      samePath(common, commonDir) &&
      git(repository, ['config', '--get', marker]).trim() === 'true'
    );
  } catch {
    return false;
  }
};

const localGit = path.join(local, '.git');
const ours = [
  ...[worktree, conflict, rebasing, detached].map((tree) => [tree, localGit]),
  [local, localGit],
  [remote, remote],
  [upstream, upstream],
  ...[shallow, partial, empty, noRemote].map((repository) => [
    repository,
    path.join(repository, '.git'),
  ]),
];
for (const [repository, commonDir] of ours) {
  if (fs.existsSync(repository) && !madeHere(repository, commonDir)) {
    console.error(
      `${repository} wasn't made by this script, so it is left alone. Move it away to make the playground.`,
    );
    process.exit(1);
  }
}
for (const [repository] of ours) {
  fs.rmSync(repository, { recursive: true, force: true });
}

const { main, first, noteText } = historyOfMain();
const { tracked, remoteOnly } = branches(main, first, flags.has('--large'));
write('done\n');

fs.mkdirSync(local, { recursive: true });
git(folder, ['init', '--quiet', '--bare', '--initial-branch=main', remote]);
git(local, ['init', '--quiet', '--initial-branch=main']);
for (const repository of [local, remote]) {
  git(repository, ['config', marker, 'true']);
}
git(remote, ['config', 'uploadpack.allowFilter', 'true']);
git(
  local,
  ['-c', 'core.ignorecase=false', 'fast-import', '--quiet', '--done'],
  Buffer.concat(stream),
);
git(local, ['branch', '--force', 'follows-main', 'main~2']);
git(local, ['remote', 'add', 'origin', remote]);
git(local, [
  'push',
  '--quiet',
  'origin',
  'refs/heads/main:refs/heads/main',
  ...tracked
    .slice(1)
    .map((name) => `refs/playground/${name}:refs/heads/${name}`),
  ...pushedTags.map((tag) => `refs/tags/${tag}`),
  'refs/playground/tags/moved:refs/tags/moved',
  ...remoteOnly.map((name) => `refs/playground/${name}:refs/heads/${name}`),
]);
git(
  local,
  ['update-ref', '--stdin'],
  git(local, ['for-each-ref', '--format=delete %(refname)', 'refs/playground']),
);
git(local, ['fetch', '--quiet', 'origin']);
git(local, ['remote', 'set-head', 'origin', 'main']);
fs.writeFileSync(
  path.join(remote, 'hooks', 'pre-receive'),
  [
    '#!/bin/sh',
    'while read old new ref; do',
    '  if [ "$ref" = refs/heads/protected-ahead ]; then',
    '    echo "The playground\'s pre-receive hook protects protected-ahead, so this push is refused." >&2',
    '    exit 1',
    '  fi',
    'done',
    '',
  ].join('\n'),
  { mode: 0o755 },
);
const upstreamOf = (name: string, remoteName: string, merge: string) =>
  `[branch "${name}"]\n\tremote = ${remoteName}\n\tmerge = ${merge}\n`;
fs.appendFileSync(
  path.join(local, '.git', 'config'),
  [
    ...tracked.map((name) => upstreamOf(name, 'origin', `refs/heads/${name}`)),
    upstreamOf('gone-upstream', 'origin', 'refs/heads/gone-upstream'),
    upstreamOf('follows-main', '.', 'refs/heads/main'),
  ].join(''),
);

if (flags.has('--two-remotes')) {
  git(folder, ['init', '--quiet', '--bare', '--initial-branch=main', upstream]);
  git(upstream, ['config', marker, 'true']);
  git(local, [
    'push',
    '--quiet',
    upstream,
    'main:main',
    'main~1:refs/heads/upstream-only',
    'refs/tags/release-1',
  ]);
  git(local, ['remote', 'add', 'upstream', upstream]);
  git(local, ['fetch', '--quiet', 'upstream']);
  git(local, [
    'branch',
    '--quiet',
    '--track',
    'tracks-upstream',
    'upstream/main',
  ]);
}

git(local, ['reset', '--quiet', '--hard', 'main']);
git(local, ['worktree', 'add', '--quiet', worktree, 'in-worktree']);

const stops = (cwd: string, args: readonly string[]) => {
  try {
    execFileSync('git', args, {
      cwd,
      env: { ...process.env, ...identity },
      stdio: 'ignore',
    });
  } catch {
    return;
  }
  throw new Error(`git ${args.join(' ')} was meant to stop on a conflict.`);
};
git(local, ['worktree', 'add', '--quiet', conflict, 'conflict-ours']);
stops(conflict, ['merge', '--no-edit', 'conflict-theirs']);
git(local, ['worktree', 'add', '--quiet', rebasing, 'rebasing']);
stops(rebasing, ['rebase', 'conflict-theirs']);
git(local, ['worktree', 'add', '--quiet', '--detach', detached, 'main']);
for (const step of [1, 2]) {
  git(detached, [
    'commit',
    '--quiet',
    '--allow-empty',
    '--message',
    `Commit on no branch, step ${step} of 2`,
  ]);
}

const remoteUrl = pathToFileURL(remote).href;
git(folder, ['clone', '--quiet', '--depth', '20', remoteUrl, shallow]);
git(folder, ['clone', '--quiet', '--filter=blob:none', remoteUrl, partial]);
git(folder, ['clone', '--quiet', remote, noRemote]);
git(noRemote, ['remote', 'remove', 'origin']);
fs.mkdirSync(empty);
git(empty, ['init', '--quiet', '--initial-branch=main']);
for (const repository of [shallow, partial, noRemote, empty]) {
  git(repository, ['config', marker, 'true']);
}

const edit = (file: string, content: string) =>
  fs.writeFileSync(path.join(local, file), content);
edit('notes.txt', `${noteText}a note to stash\n`);
git(local, ['stash', 'push', '--quiet', '--message', 'Stash a note']);
edit('README.md', `${readme}\nA stashed line.\n`);
edit('scratch.txt', 'An untracked file, stashed too.\n');
git(local, [
  'stash',
  'push',
  '--quiet',
  '--include-untracked',
  '--message',
  'Stash a change with an untracked file',
]);
edit(
  'samples/app.ts',
  `${samples['samples/app.ts'][1]}\nexport const staged = true;\n`,
);
git(local, ['add', 'samples/app.ts']);
git(local, ['mv', 'samples/data.json', 'samples/settings.json']);
git(local, ['mv', 'samples/main.py', 'samples/greet.py']);
edit(
  'samples/greet.py',
  `${samples['samples/main.py'][1]}print(greet("staged"))\n`,
);
git(local, ['add', 'samples/greet.py']);
git(local, ['mv', 'samples/lib.rs', 'samples/greet.rs']);
edit(
  'samples/greet.rs',
  `${samples['samples/lib.rs'][1]}\npub const UNSTAGED: bool = true;\n`,
);
fs.mkdirSync(path.join(local, 'moved'));
git(local, ['mv', 'notes with spaces.txt', 'moved/notes with spaces.txt']);
edit('samples/added.txt', 'A file added and staged.\n');
git(local, ['add', 'samples/added.txt']);
git(local, ['rm', '--quiet', 'samples/Program.cs']);
fs.renameSync(
  path.join(local, 'samples', 'main.go'),
  path.join(local, 'samples', 'hello.go'),
);
edit(
  'samples/style.css',
  `${samples['samples/style.css'][1]}\n.unstaged {\n  color: red;\n}\n`,
);
fs.rmSync(path.join(local, 'samples', 'script.sh'));
edit('draft.md', '# Draft\n\nAn untracked file.\n');

console.log(
  `Made ${local}, with its remote and worktrees beside it: ${[remote, worktree, conflict, rebasing, detached, shallow, partial, empty, noRemote, ...(flags.has('--two-remotes') ? [upstream] : [])].map((made) => path.basename(made)).join(', ')}.`,
);

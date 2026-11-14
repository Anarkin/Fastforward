import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { changesOnMain } from './gitChanges.mts';
import {
  annotated,
  commit,
  lightweight,
  pointer,
  searchable,
  stream,
  write,
} from './gitImport.mts';
import { binary, png, sentence, shade } from './samples.mts';

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
const copies = 10;
const longHistory = 50_000;

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

const samples = {
  'samples/app.ts': [
    'export function greet(name: string): string {\n  return `Hello, ${name}!`;\n}\n',
    "export function greet(name: string, excited = false): string {\n  return `Hello, ${name}${excited ? '!' : '.'}`;\n}\n",
  ],
  'samples/main.py': [
    'def greet(name):\n    return f"Hello, {name}!"\n\n\nprint(greet("world"))\n',
    'def greet(name: str, excited: bool = False) -> str:\n    return f"Hello, {name}{\'!\' if excited else \'.\'}"\n\n\nprint(greet("world", True))\n',
  ],
  'samples/lib.rs': [
    'pub fn greet(name: &str) -> String {\n    format!("Hello, {name}!")\n}\n',
    'pub fn greet(name: &str, excited: bool) -> String {\n    format!("Hello, {name}{}", if excited { "!" } else { "." })\n}\n',
  ],
  'samples/main.go': [
    'package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("Hello, world!")\n}\n',
    'package main\n\nimport "fmt"\n\nfunc main() {\n\tname := "world"\n\tfmt.Printf("Hello, %s!\\n", name)\n}\n',
  ],
  'samples/Program.cs': [
    'Console.WriteLine("Hello, world!");\n',
    'var name = args.Length > 0 ? args[0] : "world";\nConsole.WriteLine($"Hello, {name}!");\n',
  ],
  'samples/style.css': [
    '.greeting {\n  color: #06c;\n  font-weight: bold;\n}\n',
    '.greeting {\n  color: #c60;\n  font-weight: 600;\n  letter-spacing: 0.02em;\n}\n',
  ],
  'samples/data.json': [
    '{\n  "name": "playground",\n  "branches": 40\n}\n',
    '{\n  "name": "playground",\n  "branches": 47,\n  "tags": true\n}\n',
  ],
  'samples/script.sh': [
    '#!/bin/sh\necho "Hello, world!"\n',
    '#!/bin/sh\nname="${1:-world}"\necho "Hello, $name!"\n',
  ],
};

const readme = `# Playground

Made by \`npm run playground:git\` to try **Fastforward** by hand.

## What is here

- Branches lagging behind, ahead of and diverged from their upstreams
- Branches never pushed, and tags only here
- Merges, stashes and uncommitted changes

## Bubbles

| Kind | Example |
|---|---|
| Branch | \`lagging-01\` |
| Tag | \`release-1\` |

\`\`\`ts
export function greet(name: string): string {
  return \`Hello, \${name}!\`;
}
\`\`\`

> Rebuild it whenever you like.

![Logo](images/logo.png)
`;

let main = commit('refs/heads/main', {
  changes: [{ path: 'README.md', content: readme }],
  message: 'Start the playground',
});
const first = main;
const notes = [];
let noteText = '';
for (let note = 1; note <= 6; note++) {
  noteText += `note ${note}\n`;
  main = commit('refs/heads/main', {
    from: main,
    changes: [{ path: 'notes.txt', content: noteText }],
    message: `Add note ${note}`,
  });
  notes.push(main);
}
lightweight('release-1', notes[1]);
annotated('release-2', notes[3], 'Release 2');
lightweight('release-3', notes[5]);
for (let k = 1; k <= copies; k++) {
  lightweight(
    `draft-${String(k).padStart(2, '0')}`,
    notes[notes.length - 1 - ((k - 1) % notes.length)],
  );
}
lightweight('moved', notes[2]);
pointer('refs/playground/tags/moved', notes[4]);

main = commit('refs/heads/main', {
  from: main,
  changes: [
    ...Object.entries(samples).map(([file, [original]]) => ({
      path: file,
      content: original,
    })),
    { path: 'samples/old-name.txt', content: 'This file is renamed later.\n' },
    { path: 'samples/obsolete.txt', content: 'This file is deleted later.\n' },
  ],
  message: searchable('Add code samples in several languages', [
    'code',
    'syntax',
    'language',
    'typescript',
    'python',
    'rust',
    'go',
    'csharp',
    'css',
    'json',
    'shell',
  ]),
});
const piled = main;
for (let pile = 1; pile <= 6; pile++) {
  lightweight(`pile-${pile}`, piled);
}
main = commit('refs/heads/main', {
  from: main,
  changes: Object.entries(samples).map(([file, [, second]]) => ({
    path: file,
    content: second,
  })),
  message: searchable('Change every code sample', [
    'code',
    'syntax',
    'word diff',
    'change',
  ]),
});
main = commit('refs/heads/main', {
  from: main,
  changes: [
    {
      path: 'images/logo.png',
      content: png(64, 64, (x, y) => [
        shade(x * 0.2),
        shade(0.4 + y * 0.3),
        204,
      ]),
    },
  ],
  message: searchable('Add a logo', ['image', 'picture', 'png', 'logo']),
});
main = commit('refs/heads/main', {
  from: main,
  changes: [
    {
      path: 'images/logo.png',
      content: png(64, 64, (x, y) => [
        204,
        shade(0.4 + y * 0.3),
        shade(x * 0.2),
      ]),
    },
    {
      path: 'images/photo.png',
      content: png(256, 160, (x, y) => [shade(x), shade(y), shade(1 - x * y)]),
    },
  ],
  message: searchable('Recolor the logo and add a photo', [
    'image',
    'picture',
    'png',
    'logo',
    'photo',
    'change',
  ]),
});
main = commit('refs/heads/main', {
  from: main,
  changes: [{ path: 'samples/data.bin', content: binary(4096, 1) }],
  message: searchable('Add a binary file', ['binary', 'bin']),
});
main = commit('refs/heads/main', {
  from: main,
  changes: [{ path: 'samples/data.bin', content: binary(4096, 2) }],
  message: searchable('Change the binary file', ['binary', 'bin', 'change']),
});
main = commit('refs/heads/main', {
  from: main,
  changes: [
    {
      path: 'long-lines.txt',
      content:
        Array.from({ length: 20 }, (_, i) => sentence(i, 250)).join('\n') +
        '\n',
    },
    {
      path: 'large.txt',
      content:
        Array.from(
          { length: 40_000 },
          (_, i) => `line ${i + 1}: ${sentence(i, 8)}`,
        ).join('\n') + '\n',
    },
  ],
  message: searchable('Add a file of very long lines and a large file', [
    'long line',
    'wrap',
    'large',
    'big',
    'size',
  ]),
});
main = commit('refs/heads/main', {
  from: main,
  changes: [
    { path: 'notes with spaces.txt', content: 'A name with spaces.\n' },
    {
      path: 'ünïcödé – 名前.md',
      content: '# Ünïcödé\n\nA name beyond ASCII.\n',
    },
  ],
  message: searchable(
    'Add files whose names have spaces and characters beyond ASCII',
    ['unicode', 'spaces', 'name', 'non-ascii'],
  ),
});
main = commit('refs/heads/main', {
  from: main,
  changes: [{ rename: ['samples/old-name.txt', 'samples/new-name.txt'] }],
  message: searchable('Rename a sample', ['rename', 'renamed', 'move']),
});
main = commit('refs/heads/main', {
  from: main,
  changes: [{ delete: 'samples/obsolete.txt' }],
  message: searchable('Delete an obsolete sample', [
    'delete',
    'deleted',
    'remove',
  ]),
});

main = changesOnMain(main);

let feature = main;
let featureText = '';
for (let step = 1; step <= 2; step++) {
  featureText += `feature step ${step}\n`;
  feature = commit('refs/playground/merged', {
    from: feature,
    changes: [{ path: 'merged/feature.txt', content: featureText }],
    message: `Build the merged feature, step ${step}`,
  });
}
main = commit('refs/heads/main', {
  from: main,
  merges: [feature],
  changes: [{ path: 'merged/feature.txt', content: featureText }],
  message: searchable("Merge branch 'merged-feature'", ['merge', 'merged']),
});
const octopus = ['a', 'b', 'c'].map((part) =>
  commit(`refs/playground/octopus-${part}`, {
    from: main,
    changes: [
      { path: `merged/octopus-${part}.txt`, content: `octopus ${part}\n` },
    ],
    message: `Add octopus part ${part}`,
  }),
);
main = commit('refs/heads/main', {
  from: main,
  merges: octopus,
  changes: ['a', 'b', 'c'].map((part) => ({
    path: `merged/octopus-${part}.txt`,
    content: `octopus ${part}\n`,
  })),
  message: searchable(
    "Merge branches 'octopus-a', 'octopus-b' and 'octopus-c'",
    ['merge', 'octopus'],
  ),
});
let changelog = '';
for (const entry of ['the merges', 'the samples']) {
  changelog += `Noted ${entry}.\n`;
  main = commit('refs/heads/main', {
    from: main,
    changes: [{ path: 'CHANGELOG.md', content: changelog }],
    message: `Note ${entry} in the changelog`,
  });
}

const tracked = ['main'];
const appended = new Map<string, string>();
const append = (
  ref: string,
  from: number,
  file: string,
  k: number,
  what: string,
) => {
  let tip = from;
  let text = appended.get(`${from} ${file}`) ?? '';
  for (let j = 1; j <= k; j++) {
    text += `${what} ${j}\n`;
    tip = commit(ref, {
      from: tip,
      changes: [{ path: file, content: text }],
      message: `${what} (${j} of ${k})`,
    });
    appended.set(`${tip} ${file}`, text);
  }
  return tip;
};
const start = (name: string) => {
  const tip = commit(`refs/heads/${name}`, {
    from: main,
    changes: [{ path: `${name}.txt`, content: 'shared\n' }],
    message: `Start ${name}`,
  });
  appended.set(`${tip} ${name}.txt`, 'shared\n');
  pointer(`refs/playground/${name}`, tip);
  tracked.push(name);
  return tip;
};
const lagging = (name: string, k: number) =>
  append(
    `refs/playground/${name}`,
    start(name),
    `${name}.txt`,
    k,
    `Add work only the remote has to ${name}`,
  );
const ahead = (name: string, k: number) =>
  append(
    `refs/heads/${name}`,
    start(name),
    `${name}-mine.txt`,
    k,
    `Add unpushed work to ${name}`,
  );

for (let k = 1; k <= copies; k++) {
  const t = String(k).padStart(2, '0');
  lagging(`lagging-${t}`, k);
  ahead(`ahead-${t}`, k);
  const diverged = `diverged-${t}`;
  const base = start(diverged);
  append(
    `refs/playground/${diverged}`,
    base,
    `${diverged}.txt`,
    k,
    `Add work only the remote has to ${diverged}`,
  );
  append(
    `refs/heads/${diverged}`,
    base,
    `${diverged}-mine.txt`,
    k,
    `Add unpushed work to ${diverged}`,
  );
  append(
    `refs/heads/local-only-${t}`,
    main,
    `local-only-${t}.txt`,
    k,
    `Add unpushed work to local-only-${t}`,
  );
}
lagging('in-worktree', 2);
ahead('protected-ahead', 1);
const nested =
  'feature/team/a-very-long-branch-name-that-keeps-going-to-show-how-bubbles-wrap';
pointer(`refs/heads/${nested}`, main);
pointer(`refs/playground/${nested}`, main);
tracked.push(nested);
pointer('refs/heads/gone-upstream', main);
pointer('refs/heads/blocked-pull', main);
commit('refs/playground/blocked-pull', {
  from: main,
  changes: [
    {
      path: 'samples/style.css',
      content: `${samples['samples/style.css'][1]}\n.incoming {\n  color: green;\n}\n`,
    },
  ],
  message:
    'Change the style on the remote, where the working tree changes it too',
});
tracked.push('blocked-pull');
const remoteOnly = [1, 2, 3].map((n) => {
  const name = `remote-only-${n}`;
  commit(`refs/playground/${name}`, {
    from: main,
    changes: [{ path: `${name}.txt`, content: `only on the remote ${n}\n` }],
    message: `Add work only the remote has, on ${name}`,
  });
  return name;
});
for (let team = 1; team <= 10; team++) {
  for (let n = 1; n <= 30; n++) {
    pointer(
      `refs/heads/crowd/team-${String(team).padStart(2, '0')}/branch-${String((team - 1) * 30 + n).padStart(3, '0')}`,
      first,
    );
  }
}
let odd = main;
let oddText = '';
for (const [message, author] of [
  [
    'Explain in one very long subject line everything this commit does, why it does it, what it leaves for later, who asked for it in the first place, and when',
    undefined,
  ],
  [
    'Explain a change in a body\n\nThe subject stays short, and the body says the rest.\n\n- point one\n- point two\n',
    undefined,
  ],
  ['Celebrate the release 🎉🚀', undefined],
  [
    'Commit from far in the future, in an odd time zone',
    'Zoë Ångström 李 <zoe@example.com> 4070908800 +1345',
  ],
  [
    'Commit from long ago, in another odd time zone',
    'Playground <playground@example.com> 86400 -1200',
  ],
] as const) {
  oddText += `${message.split('\n')[0]}\n`;
  odd = commit('refs/heads/odd-commits', {
    from: odd,
    changes: [{ path: 'odd-commits.txt', content: oddText }],
    message,
    author,
  });
}
for (const [side, content] of [
  ['conflict-ours', 'ours\n'],
  ['conflict-theirs', 'theirs\n'],
  ['rebasing', 'rebasing\n'],
]) {
  commit(`refs/heads/${side}`, {
    from: main,
    changes: [{ path: 'conflict.txt', content }],
    message: `Write the ${side} side of a conflict`,
  });
}
if (flags.has('--large')) {
  let tip = main;
  for (let i = 1; i <= longHistory; i++) {
    tip = commit('refs/heads/long-history', {
      from: tip,
      changes: [{ path: 'long-history.txt', content: `step ${i}\n` }],
      message: `Take step ${i} of a long history`,
    });
  }
}
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
  ...[
    'release-1',
    'release-2',
    'release-3',
    'pile-1',
    'pile-2',
    'pile-3',
    'pile-4',
    'pile-5',
    'pile-6',
  ].map((tag) => `refs/tags/${tag}`),
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

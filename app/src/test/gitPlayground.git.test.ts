import * as assert from 'node:assert';
import {
  type ChildProcess,
  execFile,
  execFileSync,
  spawn,
} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, suite, test } from 'vitest';
import {
  createsAnewThroughJunctions,
  removeFolder,
  tempFolder,
} from './repositories';

const script = path.join(
  __dirname,
  '..',
  '..',
  'scripts',
  'playground',
  'git.mts',
);

interface Ran {
  readonly code: number;
  readonly output: string;
}

const running = new Map<ChildProcess, Promise<Ran>>();

function playground(folder: string, ...flags: string[]): Promise<Ran> {
  const child = spawn(process.execPath, [script, folder, ...flags], {
    detached: process.platform !== 'win32',
    windowsHide: true,
  });
  let output = '';
  child.stdout.setEncoding('utf8').on('data', (text: string) => {
    output += text;
  });
  child.stderr.setEncoding('utf8').on('data', (text: string) => {
    output += text;
  });
  const ran = new Promise<Ran>((resolve) => {
    child.on('error', (error) => {
      output += error.message;
    });
    child.on('close', (code) => {
      running.delete(child);
      resolve({ code: code ?? 1, output });
    });
  });
  running.set(child, ran);
  return ran;
}

function killWithItsGits(child: ChildProcess): void {
  if (child.pid === undefined) {
    return;
  }
  try {
    if (process.platform === 'win32') {
      execFileSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
        stdio: 'ignore',
      });
    } else {
      process.kill(-child.pid, 'SIGKILL');
    }
  } catch {
    child.kill('SIGKILL');
  }
}

async function stopPlaygrounds(): Promise<void> {
  const closing = [...running];
  for (const [child] of closing) {
    killWithItsGits(child);
  }
  await Promise.all(closing.map(([, closed]) => closed));
}

async function gitOutput(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await promisify(execFile)('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout;
}

async function git(cwd: string, ...args: string[]): Promise<string> {
  return (await gitOutput(cwd, ...args)).trim();
}

const names = {
  local: 'Fastforward-playground',
  remote: 'Fastforward-playground-remote.git',
  worktree: 'Fastforward-playground-worktree',
  conflict: 'Fastforward-playground-conflict',
  rebasing: 'Fastforward-playground-rebasing',
  detached: 'Fastforward-playground-detached',
  shallow: 'Fastforward-playground-shallow',
  partial: 'Fastforward-playground-partial',
  empty: 'Fastforward-playground-empty',
  noRemote: 'Fastforward-playground-no-remote',
  upstream: 'Fastforward-playground-upstream.git',
};

const builds = 240_000;

const everyWay = (file: string) => `showcase/everything/${file}`;

const renamedEveryWay = (similarity: 'R100' | 'R~', from: string, to: string) =>
  `${similarity} ${everyWay(from)} -> ${everyWay(to)}`;

suite('Playground', () => {
  let real: string;
  let linked: string | undefined;
  let folder: string;
  let local: string;
  let remote: string;
  let worktree: string;

  beforeAll(async () => {
    real = tempFolder('playground');
    if (createsAnewThroughJunctions()) {
      linked = `${real}-link`;
      fs.symlinkSync(real, linked, 'junction');
    }
    folder = linked ?? real;
    local = path.join(folder, names.local);
    remote = path.join(folder, names.remote);
    worktree = path.join(folder, names.worktree);
    const ran = await playground(folder, '--two-remotes', '--large');
    assert.strictEqual(ran.code, 0, ran.output);
  }, builds);

  afterAll(async () => {
    await stopPlaygrounds();
    if (linked !== undefined) {
      fs.rmSync(linked, { recursive: true, force: true });
    }
    removeFolder(real);
  }, 30_000);

  const at = (name: string) => path.join(folder, name);

  const tracking = async (): Promise<Record<string, string>> =>
    Object.fromEntries(
      (
        await git(
          local,
          'for-each-ref',
          '--format=%(refname:short)\t%(upstream:short) %(upstream:track)',
          'refs/heads',
        )
      )
        .split('\n')
        .map((line) => line.split('\t').map((part) => part.trim())),
    );

  const status = async (): Promise<string[]> =>
    (await gitOutput(local, 'status', '--porcelain'))
      .split('\n')
      .filter(Boolean)
      .toSorted();

  const uncommitted = [
    ' D samples/main.go',
    ' D samples/script.sh',
    ' M samples/style.css',
    '?? draft.md',
    '?? samples/hello.go',
    'A  samples/added.txt',
    'D  samples/Program.cs',
    'M  samples/app.ts',
    'R  "notes with spaces.txt" -> "moved/notes with spaces.txt"',
    'R  samples/data.json -> samples/settings.json',
    'R  samples/main.py -> samples/greet.py',
    'RM samples/lib.rs -> samples/greet.rs',
  ];

  const statusesSeenByTheApp = async (subject: string): Promise<string[]> => {
    const tokens = (
      await gitOutput(
        local,
        'log',
        '-1',
        '--format=',
        '--name-status',
        '-z',
        '-M',
        `--grep=${subject}`,
        'main',
      )
    )
      .split('\0')
      .filter(Boolean);
    const entries: string[] = [];
    for (let i = 0; i < tokens.length; i++) {
      const code = tokens[i];
      const paired = /^[RC]/.test(code);
      const paths = tokens.slice(i + 1, i + (paired ? 3 : 2));
      i += paths.length;
      const shown = code.startsWith('R')
        ? code === 'R100'
          ? 'R100'
          : 'R~'
        : code;
      entries.push(`${shown} ${paths.join(' -> ')}`);
    }
    return entries.toSorted();
  };

  test('makes a repository with a remote beside it, holding ten branches lagging behind, ahead of and diverged from their upstreams by 1 to 10 commits, and ten never pushed', async () => {
    const branches = await tracking();
    assert.strictEqual(branches.main, 'origin/main');
    for (const k of [1, 7, 10]) {
      const t = String(k).padStart(2, '0');
      assert.strictEqual(
        branches[`lagging-${t}`],
        `origin/lagging-${t} [behind ${k}]`,
      );
      assert.strictEqual(
        branches[`ahead-${t}`],
        `origin/ahead-${t} [ahead ${k}]`,
      );
      assert.strictEqual(
        branches[`diverged-${t}`],
        `origin/diverged-${t} [ahead ${k}, behind ${k}]`,
      );
      assert.strictEqual(branches[`local-only-${t}`], '');
      assert.strictEqual(
        await git(local, 'rev-list', '--count', `main..local-only-${t}`),
        String(k),
      );
    }
    assert.strictEqual(await git(local, 'branch', '--show-current'), 'main');
  });

  test('holds a branch whose upstream is gone, one following the local main, one with a long nested name, and one the remote refuses to take', async () => {
    const branches = await tracking();
    assert.strictEqual(
      branches['gone-upstream'],
      'origin/gone-upstream [gone]',
    );
    assert.strictEqual(branches['follows-main'], 'main [behind 2]');
    const nested =
      'feature/team/a-very-long-branch-name-that-keeps-going-to-show-how-bubbles-wrap';
    assert.strictEqual(branches[nested], `origin/${nested}`);
    assert.strictEqual(
      branches['protected-ahead'],
      'origin/protected-ahead [ahead 1]',
    );
    await assert.rejects(
      git(local, 'push', 'origin', 'protected-ahead'),
      /protects protected-ahead/,
    );
  });

  test('checks a branch lagging behind its upstream out in a worktree beside the repository', async () => {
    assert.strictEqual(
      (await tracking())['in-worktree'],
      'origin/in-worktree [behind 2]',
    );
    assert.strictEqual(
      await git(worktree, 'branch', '--show-current'),
      'in-worktree',
    );
    assert.strictEqual(
      fs.realpathSync.native(
        path.resolve(
          worktree,
          await git(worktree, 'rev-parse', '--git-common-dir'),
        ),
      ),
      fs.realpathSync.native(path.join(local, '.git')),
    );
  });

  test('tags commits on the remote too, one with an annotated tag, six on one commit, ten only here, and one the remote moved', async () => {
    const tags = (await git(local, 'tag')).split('\n');
    assert.ok(tags.includes('draft-10'));
    assert.strictEqual(await git(local, 'cat-file', '-t', 'release-2'), 'tag');
    const remoteTags = (await git(remote, 'tag')).split('\n');
    for (const tag of ['release-1', 'release-3', 'pile-1', 'pile-6', 'moved']) {
      assert.ok(remoteTags.includes(tag), tag);
    }
    assert.ok(!remoteTags.includes('draft-01'));
    const piled = await git(local, 'rev-parse', 'pile-1');
    assert.strictEqual(await git(local, 'rev-parse', 'pile-6'), piled);
    assert.notStrictEqual(
      await git(local, 'rev-parse', 'moved'),
      await git(remote, 'rev-parse', 'moved'),
    );
  });

  test('merges a branch and an octopus of three into main', async () => {
    const merges = (
      await git(local, 'rev-list', '--merges', '--parents', 'main')
    ).split('\n');
    assert.strictEqual(merges.length, 2);
    assert.deepStrictEqual(
      merges
        .map((line) => line.split(' ').length - 1)
        .toSorted((a, b) => a - b),
      [2, 4],
    );
  });

  test('keeps two stashes, one with an untracked file, and leaves every kind of change uncommitted', async () => {
    assert.strictEqual(
      (await git(local, 'stash', 'list')).split('\n').length,
      2,
    );
    assert.ok(await git(local, 'rev-parse', '--verify', 'stash@{0}^3'));
    assert.deepStrictEqual(await status(), uncommitted);
  });

  test('commits code in several languages, Markdown, images changed between commits, binary, very long lines, a large file, odd names, a rename and a delete', async () => {
    const files = (await git(local, 'ls-tree', '-r', '--name-only', 'HEAD'))
      .split('\n')
      .map((file) => file.replace(/^"|"$/g, ''));
    for (const file of [
      'README.md',
      'samples/app.ts',
      'samples/main.py',
      'samples/lib.rs',
      'samples/main.go',
      'samples/Program.cs',
      'images/logo.png',
      'images/photo.png',
      'samples/data.bin',
      'long-lines.txt',
      'large.txt',
      'notes with spaces.txt',
      'samples/new-name.txt',
    ]) {
      assert.ok(files.includes(file), file);
    }
    assert.ok(
      (await git(local, 'ls-tree', '-r', '--name-only', '-z', 'HEAD'))
        .split('\0')
        .includes('ünïcödé – 名前.md'),
    );
    assert.ok(!files.includes('samples/old-name.txt'));
    assert.ok(!files.includes('samples/obsolete.txt'));
    assert.ok(
      (await git(local, 'log', '--format=%h', '--', 'images/logo.png')).split(
        '\n',
      ).length >= 2,
    );
    assert.ok(fs.statSync(path.join(local, 'large.txt')).size > 1_000_000);
    assert.ok(
      fs
        .readFileSync(path.join(local, 'long-lines.txt'), 'utf8')
        .split('\n')
        .some((line) => line.length > 1000),
    );
  });

  test('stops a merge on a conflict, pauses a rebase and leaves commits on no branch, each in a worktree of its own beside the repository', async () => {
    assert.ok(
      (await gitOutput(at(names.conflict), 'status', '--porcelain')).includes(
        'AA conflict.txt',
      ),
    );
    assert.ok(
      await git(at(names.conflict), 'rev-parse', '--verify', 'MERGE_HEAD'),
    );
    assert.ok(
      fs.existsSync(
        path.join(
          await git(at(names.rebasing), 'rev-parse', '--absolute-git-dir'),
          'rebase-merge',
        ),
      ),
    );
    assert.strictEqual(
      await git(at(names.detached), 'rev-parse', '--abbrev-ref', 'HEAD'),
      'HEAD',
    );
    assert.strictEqual(
      await git(
        at(names.detached),
        'rev-list',
        '--count',
        'HEAD',
        '--not',
        '--branches',
        '--remotes',
        '--tags',
      ),
      '2',
    );
  });

  test('holds a lagging branch whose pull the uncommitted changes block, three branches only on the remote, and three hundred branches on one commit', async () => {
    const branches = await tracking();
    assert.strictEqual(
      branches['blocked-pull'],
      'origin/blocked-pull [behind 1]',
    );
    assert.ok(
      (
        await git(
          local,
          'diff',
          '--name-only',
          'blocked-pull',
          'origin/blocked-pull',
        )
      )
        .split('\n')
        .includes('samples/style.css'),
    );
    const remoteBranches = (
      await git(
        remote,
        'for-each-ref',
        '--format=%(refname:short)',
        'refs/heads',
      )
    ).split('\n');
    for (const name of ['remote-only-1', 'remote-only-3']) {
      assert.ok(remoteBranches.includes(name), name);
      assert.ok(!(name in branches), name);
    }
    const crowd = (
      await git(
        local,
        'for-each-ref',
        '--format=%(objectname)',
        'refs/heads/crowd',
      )
    ).split('\n');
    assert.strictEqual(crowd.length, 300);
    assert.strictEqual(new Set(crowd).size, 1);
  });

  test('keeps commits with a long subject, a body, emoji, an author beyond ASCII and dates far apart in odd time zones', async () => {
    const log = await git(
      local,
      'log',
      '--format=%an%x09%ad%x09%s',
      '--date=iso',
      'main..odd-commits',
    );
    assert.match(log, /Zoë Ångström 李/);
    assert.match(log, /2099-\d\d-\d\d \d\d:\d\d:\d\d \+1345/);
    assert.match(log, /1970-\d\d-\d\d \d\d:\d\d:\d\d -1200/);
    assert.match(log, /🎉/);
    assert.ok(log.split('\n').some((line) => line.split('\t')[2].length > 150));
    assert.match(
      await git(local, 'log', '--format=%b', 'main..odd-commits'),
      /- point one/,
    );
  });

  test("changes files in every way a diff shows: whitespace alone, line endings, a missing final newline, empty files, the executable bit, a link, a type, and thousands of files at once on a branch of their own, so that the worktrees and clones beside the repository don't write them all again", async () => {
    const tree = await git(local, 'ls-tree', '-r', 'HEAD', 'diffs');
    assert.match(tree, /^100755 blob \S+\tdiffs\/tool\.sh$/m);
    assert.match(tree, /^120000 blob \S+\tdiffs\/link-to-readme$/m);
    assert.match(tree, /^120000 blob \S+\tdiffs\/becomes-link$/m);
    assert.ok(
      (await gitOutput(local, 'show', 'HEAD:diffs/line-endings.txt')).includes(
        '\r\n',
      ),
    );
    assert.ok(
      !(await gitOutput(local, 'show', 'HEAD:diffs/no-newline.txt')).endsWith(
        '\n',
      ),
    );
    assert.match(
      await git(
        local,
        'log',
        '--format=%s',
        '--diff-filter=D',
        '--',
        'diffs/empty.txt',
      ),
      /\S/,
    );
    assert.match(
      await git(
        local,
        'log',
        '--format=%s',
        '-w',
        '--',
        'diffs/whitespace.txt',
      ),
      /\S/,
    );
    const added = await git(
      local,
      'diff-tree',
      '--no-commit-id',
      '--name-status',
      '-r',
      'many-files',
    );
    assert.strictEqual(
      added.split('\n').filter((line) => line.startsWith('A\t')).length,
      3000,
    );
    assert.strictEqual(await git(local, 'ls-tree', 'main', 'bulk'), '');
  });

  test('clones the remote shallow and partially beside the repository, and makes an empty repository and one without a remote', async () => {
    assert.strictEqual(
      await git(at(names.shallow), 'rev-parse', '--is-shallow-repository'),
      'true',
    );
    assert.strictEqual(
      await git(
        at(names.partial),
        'config',
        'remote.origin.partialclonefilter',
      ),
      'blob:none',
    );
    assert.strictEqual(await git(at(names.empty), 'for-each-ref'), '');
    assert.strictEqual(await git(at(names.noRemote), 'remote'), '');
    assert.ok(await git(at(names.noRemote), 'rev-parse', '--verify', 'HEAD'));
  });

  test('shows every kind of file the app previews or colors, and every special case of a diff, in one unbroken stretch of main', async () => {
    const stretch = (
      await git(
        local,
        'log',
        '--first-parent',
        '--format=%H',
        'main',
        '--',
        'showcase',
      )
    ).split('\n');
    const firstParents = (
      await git(local, 'rev-list', '--first-parent', 'main')
    ).split('\n');
    const start = firstParents.indexOf(stretch[0]);
    assert.deepStrictEqual(
      firstParents.slice(start, start + stretch.length),
      stretch,
    );
    const tree = (
      await git(local, 'ls-tree', '-r', '--name-only', 'main', 'showcase')
    ).split('\n');
    for (const extension of [
      'png',
      'jpg',
      'jpeg',
      'gif',
      'webp',
      'avif',
      'bmp',
      'ico',
      'svg',
    ]) {
      const image = `showcase/images/sample.${extension}`;
      assert.ok(tree.includes(image), image);
      assert.strictEqual(
        (await git(local, 'log', '--format=%H', 'main', '--', image)).split(
          '\n',
        ).length,
        2,
        image,
      );
    }
    for (const extension of ['md', 'markdown', 'mdown', 'mkd', 'mkdn']) {
      assert.ok(
        tree.some(
          (file) =>
            file.startsWith('showcase/markdown/') &&
            file.endsWith(`.${extension}`),
        ),
        extension,
      );
    }
    const diagrams = await git(
      local,
      'show',
      'main:showcase/markdown/diagrams.md',
    );
    assert.ok((diagrams.match(/^```mermaid$/gm)?.length ?? 0) >= 3, diagrams);
    assert.ok((diagrams.match(/^```text$/gm)?.length ?? 0) >= 2, diagrams);
    assert.ok(
      tree.filter((file) => file.startsWith('showcase/languages/')).length >=
        30,
    );
    const numstat = async (subject: string) =>
      git(
        local,
        'log',
        '-1',
        '--format=',
        '--numstat',
        '-M',
        '-C',
        '-C',
        `--grep=${subject}`,
        'main',
      );
    assert.ok(
      (await numstat('Change 30,000 lines'))
        .split('\n')
        .some((line) => Number(line.split('\t')[0]) > 25_000),
    );
    assert.ok(
      fs.statSync(path.join(local, 'showcase', 'text', 'larger-than-2-mb.txt'))
        .size >
        2 * 1024 * 1024,
    );
    assert.ok(
      fs
        .readFileSync(
          path.join(local, 'showcase', 'text', 'long-line.ts'),
          'utf8',
        )
        .split('\n')
        .some((line) => line.length > 2000),
    );
    assert.ok(
      fs
        .readFileSync(
          path.join(local, 'showcase', 'text', 'many-lines.ts'),
          'utf8',
        )
        .split('\n').length > 5000,
    );
    const statuses = async (subject: string) =>
      git(
        local,
        'log',
        '-1',
        '--format=',
        '--name-status',
        '-M',
        '-C',
        '-C',
        `--grep=${subject}`,
        'main',
      );
    assert.match(await statuses('Copy a file'), /^C\d+/m);
    assert.match(
      await statuses('Rename a file and change it'),
      /^R(?!100)\d+/m,
    );
  });

  test('changes files in every way in one commit, as the app sees it finding renames but not copies', async () => {
    assert.deepStrictEqual(
      await statusesSeenByTheApp('Change files in every way at once'),
      [
        `A ${everyWay('added.txt')}`,
        `A ${everyWay('chain/c.txt')}`,
        `A ${everyWay('copy/copied.txt')}`,
        `A ${everyWay('moved/rewritten-renamed.txt')}`,
        `D ${everyWay('chain/a.txt')}`,
        `D ${everyWay('kept/deleted.txt')}`,
        `D ${everyWay('moved/rewritten.txt')}`,
        `M ${everyWay('chain/b.txt')}`,
        `M ${everyWay('kept/modified.txt')}`,
        `M ${everyWay('kept/tool.sh')}`,
        `M ${everyWay('swap/left.txt')}`,
        `M ${everyWay('swap/right.txt')}`,
        renamedEveryWay('R100', 'folder/one.txt', 'renamed-folder/one.txt'),
        renamedEveryWay('R100', 'folder/three.txt', 'renamed-folder/three.txt'),
        renamedEveryWay('R100', 'folder/two.txt', 'renamed-folder/two.txt'),
        renamedEveryWay('R100', 'images/pure.png', 'images/pure-renamed.png'),
        renamedEveryWay('R100', 'moved/Case.txt', 'moved/CASE.txt'),
        renamedEveryWay('R100', 'moved/link', 'moved/link-renamed'),
        renamedEveryWay('R100', 'moved/pure.txt', 'moved/pure-renamed.txt'),
        renamedEveryWay(
          'R100',
          'moved/to-folder.txt',
          'elsewhere/to-folder.txt',
        ),
        renamedEveryWay('R100', 'moved/tool.sh', 'moved/tool-renamed.sh'),
        renamedEveryWay(
          'R100',
          'moved/with spaces.txt',
          'moved/ünïcödé – 名前.txt',
        ),
        renamedEveryWay(
          'R~',
          'images/changed.svg',
          'images/changed-renamed.svg',
        ),
        renamedEveryWay('R~', 'markdown/guide.md', 'markdown/renamed-guide.md'),
        renamedEveryWay('R~', 'moved/changed.txt', 'moved/changed-renamed.txt'),
        `T ${everyWay('kept/becomes-link')}`,
      ].toSorted(),
    );
    const tree = await git(
      local,
      'ls-tree',
      'main',
      everyWay('moved/tool-renamed.sh'),
    );
    assert.match(tree, /^100755 /);
  });

  test('lets each kind and case be found by the words people would search for, several words finding the same commit', async () => {
    for (const word of [
      'md',
      'markdown',
      'preview',
      'html',
      'sanitize',
      'svg',
      'vector',
      'image',
      'picture',
      'png',
      'jpg',
      'jpeg',
      'gif',
      'animated',
      'webp',
      'avif',
      'bmp',
      'bitmap',
      'ico',
      'icon',
      'transparent',
      'broken',
      'syntax',
      'language',
      'binary',
      'large',
      'collapse',
      'long line',
      'unicode',
      'emoji',
      'whitespace',
      'tabs',
      'copy',
      'rename',
      'delete',
      'symlink',
      'executable',
      'newline',
      'empty',
      'crlf',
      'merge',
      'octopus',
      'mermaid',
      'diagram',
      'flowchart',
      'sequence',
      'ascii',
      'architecture',
    ]) {
      assert.notStrictEqual(
        await git(
          local,
          'log',
          '-i',
          '-F',
          `--grep=${word}`,
          '--format=%H',
          'main',
        ),
        '',
        word,
      );
    }
  });

  test('adds a second remote with --two-remotes, and a branch of 50,000 commits with --large', async () => {
    assert.deepStrictEqual((await git(local, 'remote')).split('\n'), [
      'origin',
      'upstream',
    ]);
    assert.ok(
      fs.existsSync(path.join(folder, names.upstream, 'HEAD')),
      'the upstream remote',
    );
    assert.strictEqual(
      await git(local, 'rev-list', '--count', 'main..long-history'),
      '50000',
    );
  });

  test(
    'makes the playground anew over one it made before, however it was changed, leaving out what the flags it was made with added',
    async () => {
      await git(local, 'branch', '-f', 'lagging-01', 'origin/lagging-01');
      await git(local, 'tag', 'stray');
      fs.writeFileSync(path.join(local, 'notes.txt'), 'changed');
      const ran = await playground(folder);
      assert.strictEqual(ran.code, 0, ran.output);
      assert.strictEqual(
        (await tracking())['lagging-01'],
        'origin/lagging-01 [behind 1]',
      );
      assert.strictEqual(await git(local, 'tag', '--list', 'stray'), '');
      assert.deepStrictEqual(await status(), uncommitted);
      assert.strictEqual(await git(local, 'remote'), 'origin');
      assert.ok(!fs.existsSync(path.join(folder, names.upstream)));
    },
    builds,
  );

  test('makes the playground, and anew over it, in a folder reached through a link, whose real path git reports, as temporary folders are on macOS, and on Windows by their short names', (context) => {
    if (linked === undefined) {
      context.skip();
    }
    assert.ok(fs.lstatSync(folder).isSymbolicLink(), folder);
  });

  test('leaves alone a folder of any of its names that it did not make, saying so', async () => {
    const other = tempFolder('playground-other');
    try {
      for (const name of Object.values(names)) {
        const kept = path.join(other, name, 'kept.txt');
        fs.mkdirSync(path.dirname(kept), { recursive: true });
        fs.writeFileSync(kept, 'mine');
        const ran = await playground(other);
        assert.notStrictEqual(ran.code, 0);
        assert.ok(ran.output.includes(name), ran.output);
        assert.strictEqual(fs.readFileSync(kept, 'utf8'), 'mine');
        fs.rmSync(path.join(other, name), { recursive: true });
      }
    } finally {
      removeFolder(other);
    }
  });
});

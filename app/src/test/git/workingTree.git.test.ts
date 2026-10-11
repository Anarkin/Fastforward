import * as assert from 'node:assert';
import type { SpawnOptions } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { replaceBuiltin } from '../builtins';
import { listTree } from '../../git/files';
import {
  stagedPatch,
  uncommittedCount,
  UntrackedPatches,
  withoutTouched,
  workingTreeFiles,
  workingTreePatch,
} from '../../git/workingTree';
import { isLargeChange, leftOutChanges } from '../../shared/protocol';
import { parsePatch } from '../../webview/diff';
import { waitFor } from '../fixtures';
import {
  removeFolder,
  symlinkOrSkip,
  tempFolder,
  tempRepository,
  type TempRepository,
} from '../repositories';

function holdingGit(held: (args: readonly string[]) => boolean): {
  started: (command: string) => boolean;
  release: () => void;
} {
  const childProcess = process.getBuiltinModule('node:child_process');
  const { spawn } = childProcess;
  const spawned: (readonly string[])[] = [];
  const { promise: released, resolve } = Promise.withResolvers<void>();
  const holding = (
    command: string,
    args: readonly string[],
    options: SpawnOptions,
  ) => {
    const child = spawn(command, args, options);
    spawned.push(args);
    if (held(args)) {
      const emit = child.emit.bind(child);
      child.emit = (event: string | symbol, ...rest: unknown[]) => {
        if (event !== 'close') {
          return emit(event, ...rest);
        }
        void released.then(() => emit(event, ...rest));
        return true;
      };
    }
    return child;
  };
  replaceBuiltin(childProcess, 'spawn', holding);
  return {
    started: (command) => spawned.some((args) => args.includes(command)),
    release: () => {
      replaceBuiltin(childProcess, 'spawn', spawn);
      resolve();
    },
  };
}

suite('A repository without commits', () => {
  let gitPath: string;
  let cwd: string;

  beforeAll(async () => {
    const repository = await tempRepository(tempFolder('empty'));
    gitPath = repository.gitPath;
    cwd = repository.root;
    fs.writeFileSync(path.join(cwd, 'staged.txt'), 'one\n');
    await repository.git('add', 'staged.txt');
    fs.writeFileSync(path.join(cwd, 'untracked.txt'), 'new\n');
  });

  afterAll(() => removeFolder(cwd));

  test('lists staged files as added, and untracked ones', async () => {
    const workingTree = await workingTreeFiles(gitPath, cwd);
    assert.deepStrictEqual(
      workingTree.staged?.map((file) => [file.status, file.path]),
      [['A', 'staged.txt']],
    );
    assert.deepStrictEqual(
      workingTree.files.map((file) => [file.status, file.path]),
      [['U', 'untracked.txt']],
    );
    const patch = await stagedPatch(gitPath, cwd, { path: 'staged.txt' });
    assert.ok(patch.includes('+one'), patch);
  });
});

suite('Files touched but unchanged', () => {
  let repository: TempRepository;
  let gitPath: string;
  let cwd: string;
  let index: string;
  let blob: string;
  const zero = '0'.repeat(40);
  const modified = (file: string, object: string, newId = zero) => ({
    oldMode: '100644',
    newMode: '100644',
    oldId: object,
    newId,
    linesCounted: true,
    file: {
      status: 'M' as const,
      path: file,
      oldPath: undefined,
      insertions: 0,
      deletions: 0,
    },
  });

  beforeAll(async () => {
    repository = await tempRepository(tempFolder('touched'));
    gitPath = repository.gitPath;
    cwd = repository.root;
    index = path.join(cwd, '.git', 'index');
    await repository.git('config', 'core.autocrlf', 'true');
    await repository.commit('initial', {
      'text.txt': 'text\n',
      'binary.bin': '\0\x01\x02',
      'crlf.txt': 'one\r\ntwo\r\n',
      'changed.txt': 'old\n',
      'a.txt': 'one\n',
    });
    [blob] = await repository.resolve('HEAD:a.txt');
    fs.writeFileSync(path.join(cwd, 'changed.txt'), 'new\n');
    const past = new Date(Date.UTC(2020, 0, 1));
    for (const file of ['text.txt', 'binary.bin', 'crlf.txt', 'changed.txt']) {
      fs.utimesSync(path.join(cwd, file), past, past);
    }
  });

  afterAll(() => removeFolder(cwd));

  test('lists and diffs only the changed file, leaving the index for a commit made meanwhile to lock', async () => {
    const before = fs.readFileSync(index);
    const workingTree = await workingTreeFiles(gitPath, cwd);
    assert.deepStrictEqual(
      workingTree.files.map((file) => [file.status, file.path]),
      [['M', 'changed.txt']],
    );
    const patch = await workingTreePatch(gitPath, cwd, workingTree);
    assert.deepStrictEqual(
      [...patch.matchAll(/^diff --git a\/(\S+)/gm)].map((match) => match[1]),
      ['changed.txt'],
    );
    assert.ok(fs.readFileSync(index).equals(before));
  });

  test('leaves out files only touched, whatever their names hold', async (context) => {
    if (process.platform === 'win32') {
      context.skip();
    }
    const names = ['"notes".md', 'Icon\r', 'two\nlines', 'back\\slash'];
    for (const name of names) {
      fs.writeFileSync(path.join(repository.root, name), `${name}\n`);
    }
    await repository.git('add', '--all', '--', '.', ':!changed.txt');
    await repository.git('commit', '-m', 'names');
    const ids = await repository.resolve(
      ...names.map((name) => `HEAD:${name}`),
    );
    const files = await withoutTouched(repository.gitPath, repository.root, [
      ...names.map((name, i) => modified(name, ids[i])),
      modified('a.txt', blob),
    ]);
    assert.deepStrictEqual(files, []);
  });

  test('keeps a file gone before it is read as modified, still leaving out the touched ones', async () => {
    const files = await withoutTouched(repository.gitPath, repository.root, [
      modified('a.txt', blob),
      modified('gone.txt', blob),
    ]);
    assert.deepStrictEqual(
      files.map((file) => file.path),
      ['gone.txt'],
    );
  });

  test('reads only the files git could not tell changed, not ones whose new text it already has', async () => {
    const files = await withoutTouched(repository.gitPath, repository.root, [
      modified('gone.txt', blob, '1'.repeat(40)),
      modified('a.txt', blob),
    ]);
    assert.deepStrictEqual(
      files.map((file) => file.path),
      ['gone.txt'],
    );
  });

  test('keeps many files gone before they are read as modified, which git would stop reading at, still leaving out the touched ones', async () => {
    const many = Array.from({ length: 20_000 }, (_, i) =>
      modified(`gone/${i}.txt`, blob),
    );
    const files = await withoutTouched(repository.gitPath, repository.root, [
      ...many,
      modified('a.txt', blob),
    ]);
    assert.strictEqual(files.length, many.length);
    assert.ok(!files.some((file) => file.path === 'a.txt'));
  });
});

suite(
  'Files touched but unchanged, committed with CRLF before autocrlf was on',
  () => {
    test('leaves out the touched file, which git does not count as changed, but keeps a changed binary file, whose lines git does not count', async () => {
      const repository = await tempRepository(tempFolder('touched-crlf'));
      const cwd = repository.root;
      try {
        await repository.git('config', 'core.autocrlf', 'false');
        await repository.commit('initial', {
          'crlf.txt': 'one\r\ntwo\r\n',
          'binary.bin': '\0\x01\x02',
        });
        await repository.git('config', 'core.autocrlf', 'true');
        fs.writeFileSync(path.join(cwd, 'binary.bin'), '\0\x01\x03');
        const past = new Date(Date.UTC(2020, 0, 1));
        for (const file of ['crlf.txt', 'binary.bin']) {
          fs.utimesSync(path.join(cwd, file), past, past);
        }
        const workingTree = await workingTreeFiles(repository.gitPath, cwd);
        assert.deepStrictEqual(
          workingTree.files.map((file) => [file.status, file.path]),
          [['M', 'binary.bin']],
        );
      } finally {
        removeFolder(cwd);
      }
    });
  },
);

suite('A file renamed and edited', () => {
  test('counts the bytes of its new text on disk', async () => {
    const repository = await tempRepository(tempFolder('renamed'));
    const cwd = repository.root;
    try {
      const old = Array.from({ length: 20 }, (_, i) => `line ${i}\n`).join('');
      await repository.commit('initial', { 'old.txt': old });
      await repository.git('mv', 'old.txt', 'new.txt');
      fs.appendFileSync(path.join(cwd, 'new.txt'), 'extra\n');
      const { files } = await workingTreeFiles(repository.gitPath, cwd, {
        base: 'HEAD',
        reverse: false,
      });
      assert.deepStrictEqual(
        files.map((file) => [file.status, file.path, file.bytes]),
        [['R', 'new.txt', old.length * 2 + 'extra\n'.length]],
      );
    } finally {
      removeFolder(cwd);
    }
  });
});

suite('Staged and unstaged changes', () => {
  let repository: TempRepository;

  beforeAll(async () => {
    repository = await tempRepository(tempFolder('staged'));
    await repository.commit('initial', {
      'both.txt': 'one\n',
      'staged.txt': 'a\n',
      'unstaged.txt': 'x\n',
      'uncached.txt': 'kept\n',
    });
    const write = (file: string, text: string) =>
      fs.writeFileSync(path.join(repository.root, file), text);
    write('both.txt', 'two\n');
    write('staged.txt', 'b\n');
    await repository.git('add', 'both.txt', 'staged.txt');
    await repository.git('rm', '-q', '--cached', 'uncached.txt');
    write('both.txt', 'three\n');
    write('unstaged.txt', 'y\n');
    write('new.txt', 'new\n');
  });

  afterAll(() => removeFolder(repository.root));

  test('lists the staged changes apart from the unstaged ones, which it diffs against the index', async () => {
    const workingTree = await workingTreeFiles(
      repository.gitPath,
      repository.root,
    );
    assert.deepStrictEqual(
      workingTree.staged?.map((file) => [file.status, file.path]),
      [
        ['M', 'both.txt'],
        ['M', 'staged.txt'],
        ['D', 'uncached.txt'],
      ],
    );
    assert.deepStrictEqual(
      workingTree.files.map((file) => [file.status, file.path]),
      [
        ['M', 'both.txt'],
        ['M', 'unstaged.txt'],
        ['U', 'new.txt'],
        ['U', 'uncached.txt'],
      ],
    );
    assert.strictEqual(uncommittedCount(workingTree), 5);
  });

  test('reads the sizes of the unstaged files without waiting for the staged list', async () => {
    const git = holdingGit((args) => args.includes('--cached'));
    const listed = workingTreeFiles(repository.gitPath, repository.root);
    try {
      await waitFor(() => git.started('cat-file'), 'the sizes to be read');
    } finally {
      git.release();
    }
    assert.strictEqual((await listed).files.length, 4);
  });

  test('tells which unstaged files were only touched while reading their sizes', async () => {
    const binary = path.join(repository.root, 'unstaged.txt');
    fs.writeFileSync(binary, '\0y\n');
    try {
      const git = holdingGit((args) => args.includes('cat-file'));
      const listed = workingTreeFiles(repository.gitPath, repository.root);
      try {
        await waitFor(
          () => git.started('hash-object'),
          'the touched files to be told',
        );
      } finally {
        git.release();
      }
      assert.strictEqual((await listed).files.length, 4);
    } finally {
      fs.writeFileSync(binary, 'y\n');
    }
  });

  test('reads no file again to tell whether it was only touched once git counted lines changed in it', async () => {
    const git = holdingGit(() => false);
    try {
      await workingTreeFiles(repository.gitPath, repository.root);
    } finally {
      git.release();
    }
    assert.ok(!git.started('hash-object'));
  });

  test('diffs the staged half of a file against HEAD and its unstaged half against the index', async () => {
    const staged = await stagedPatch(repository.gitPath, repository.root, {
      path: 'both.txt',
    });
    assert.match(staged, /^-one$/m);
    assert.match(staged, /^\+two$/m);
    const unstaged = await workingTreePatch(
      repository.gitPath,
      repository.root,
      await workingTreeFiles(repository.gitPath, repository.root),
      { path: 'both.txt' },
    );
    assert.match(unstaged, /^-two$/m);
    assert.match(unstaged, /^\+three$/m);
  });

  test('lists a file removed from the index but kept on disk once against HEAD, as deleted, and diffs its deletion', async () => {
    const workingTree = await workingTreeFiles(
      repository.gitPath,
      repository.root,
      { base: 'HEAD', reverse: false },
    );
    assert.deepStrictEqual(
      workingTree.files.map((file) => [file.status, file.path]),
      [
        ['M', 'both.txt'],
        ['M', 'staged.txt'],
        ['D', 'uncached.txt'],
        ['M', 'unstaged.txt'],
        ['U', 'new.txt'],
      ],
    );
    const patch = await workingTreePatch(
      repository.gitPath,
      repository.root,
      workingTree,
      { path: 'uncached.txt' },
    );
    assert.match(patch, /^-kept$/m);
  });
});

suite('A conflicted merge', () => {
  let conflicted: TempRepository;

  beforeAll(async () => {
    conflicted = await tempRepository(tempFolder('conflicted'));
    await conflicted.commit('initial');
    await conflicted.git('checkout', '-q', '-b', 'side');
    await conflicted.commit('side', { 'conflict.txt': 'a\n' });
    await conflicted.git('checkout', '-q', 'main');
    await conflicted.commit('main', { 'conflict.txt': 'b\n' });
    await assert.rejects(conflicted.git('merge', 'side'));
  });

  afterAll(() => removeFolder(conflicted.root));

  test('lists the conflicted file once, with the unstaged changes', async () => {
    const workingTree = await workingTreeFiles(
      conflicted.gitPath,
      conflicted.root,
    );
    assert.deepStrictEqual(workingTree.staged, []);
    assert.deepStrictEqual(
      workingTree.files.map((file) => file.path),
      ['conflict.txt'],
    );
  });

  test('diffs the conflicted file against our side, alone and with the rest, in as many lines as it counts', async () => {
    for (const base of [undefined, 'HEAD']) {
      const workingTree = await workingTreeFiles(
        conflicted.gitPath,
        conflicted.root,
        { base, reverse: false },
      );
      const [listed] = workingTree.files;
      for (const scope of [{}, { path: 'conflict.txt' }]) {
        const patch = await workingTreePatch(
          conflicted.gitPath,
          conflicted.root,
          workingTree,
          scope,
        );
        const files = parsePatch(patch);
        assert.deepStrictEqual(
          files.map((file) => file.path),
          ['conflict.txt'],
          patch,
        );
        const lines = files[0].hunks.flatMap((hunk) => hunk.lines);
        const count = (kind: string) =>
          lines.filter((line) => line.kind === kind).length;
        assert.deepStrictEqual(
          [count('added'), count('removed')],
          [listed.insertions, listed.deletions],
        );
        assert.deepStrictEqual(
          lines.map((line) => [line.kind, line.text.slice(0, 7)]),
          [
            ['added', '<<<<<<<'],
            ['context', 'b'],
            ['added', '======='],
            ['added', 'a'],
            ['added', '>>>>>>>'],
          ],
        );
      }
    }
  });

  test('lists the conflicted file once its text is back to our side, as it is still not resolved', async () => {
    const conflict = path.join(conflicted.root, 'conflict.txt');
    const marked = fs.readFileSync(conflict);
    try {
      fs.writeFileSync(conflict, 'b\n');
      const workingTree = await workingTreeFiles(
        conflicted.gitPath,
        conflicted.root,
      );
      assert.deepStrictEqual(
        workingTree.files.map((file) => file.path),
        ['conflict.txt'],
      );
    } finally {
      fs.writeFileSync(conflict, marked);
    }
  });

  test('lists the conflicted file once among the files of the working tree', async () => {
    assert.deepStrictEqual(
      await listTree(conflicted.gitPath, conflicted.root, undefined),
      ['conflict.txt'],
    );
  });
});

suite('Uncommitted changes', () => {
  let gitPath: string;
  let cwd: string;

  beforeAll(async () => {
    const repository = await tempRepository(tempFolder('changes'));
    gitPath = repository.gitPath;
    cwd = repository.root;
    await repository.commit('initial', { 'tracked.txt': 'one\n' });
    fs.writeFileSync(path.join(cwd, 'tracked.txt'), 'two\n');
    fs.writeFileSync(path.join(cwd, 'untracked.txt'), 'new\n');
    const nested = await tempRepository(path.join(cwd, 'nested'));
    fs.writeFileSync(path.join(nested.root, 'inner.txt'), 'inner\n');
  });

  afterAll(() => removeFolder(cwd));

  test('lists modified and untracked files', async () => {
    const { files } = await workingTreeFiles(gitPath, cwd);
    assert.deepStrictEqual(
      files.map((file) => [file.status, file.path]),
      [
        ['M', 'tracked.txt'],
        ['U', 'nested/'],
        ['U', 'untracked.txt'],
      ],
    );
  });

  test('lists the untracked files git lists as untracked and not ignored, in its order', async () => {
    const repository = await tempRepository(tempFolder('untracked'));
    const { root } = repository;
    try {
      await repository.commit('initial', {
        '.gitignore': '*.log\n!keep.log\nignored/\n',
        'removed.txt': 'kept on disk\n',
      });
      await repository.git('rm', '-q', '--cached', 'removed.txt');
      const files = {
        'a b ü.txt': 'spaces and more\n',
        'deep/er/new.txt': 'new\n',
        'x.log': 'ignored\n',
        'keep.log': 'kept\n',
        'ignored/f.txt': 'ignored\n',
        '-dash.txt': 'dash\n',
      };
      for (const [file, content] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
        fs.writeFileSync(path.join(root, file), content);
      }
      fs.mkdirSync(path.join(root, 'empty'));
      await tempRepository(path.join(root, 'nested'));
      const listed = (
        await repository.git('ls-files', '--others', '--exclude-standard', '-z')
      )
        .split('\0')
        .filter(Boolean);
      assert.deepStrictEqual(
        (await workingTreeFiles(gitPath, root)).untracked,
        listed,
      );
      assert.deepStrictEqual(listed.toSorted(), [
        '-dash.txt',
        'a b ü.txt',
        'deep/er/new.txt',
        'keep.log',
        'nested/',
        'removed.txt',
      ]);
    } finally {
      removeFolder(root);
    }
  });

  test('counts the bytes of the old and new text of each changed file', async () => {
    const { files } = await workingTreeFiles(gitPath, cwd);
    assert.deepStrictEqual(
      files.map((file) => [file.path, file.bytes]),
      [
        ['tracked.txt', 8],
        ['nested/', undefined],
        ['untracked.txt', 4],
      ],
    );
  });

  test('includes untracked files in the full patch', async () => {
    const patch = await workingTreePatch(
      gitPath,
      cwd,
      await workingTreeFiles(gitPath, cwd),
    );
    assert.ok(patch.includes('+two'));
    assert.ok(patch.includes('+new'));
    assert.ok(!patch.includes('inner'));
  });

  test('narrows the patch to one untracked file', async () => {
    const workingTree = await workingTreeFiles(gitPath, cwd);
    const patch = await workingTreePatch(gitPath, cwd, workingTree, {
      path: 'untracked.txt',
    });
    assert.ok(patch.includes('+new'));
    assert.ok(!patch.includes('+two'));
    const nested = await workingTreePatch(gitPath, cwd, workingTree, {
      path: 'nested/',
    });
    assert.strictEqual(nested, '');
  });

  test('counts the lines of untracked files, and patches only the files asked for', async () => {
    const large = path.join(cwd, 'large.txt');
    fs.writeFileSync(large, 'line\n'.repeat(2000));
    try {
      const workingTree = await workingTreeFiles(gitPath, cwd);
      const counts = workingTree.files.map((file) => [
        file.path,
        file.insertions,
      ]);
      assert.deepStrictEqual(counts, [
        ['tracked.txt', 1],
        ['large.txt', 2000],
        ['nested/', 0],
        ['untracked.txt', 1],
      ]);
      const patch = await workingTreePatch(gitPath, cwd, workingTree, {
        include: ['untracked.txt'],
      });
      assert.ok(patch.includes('+new'), patch);
      assert.ok(!patch.includes('+two'), patch);
      assert.ok(!patch.includes('+line'), patch);
      assert.strictEqual(
        await workingTreePatch(gitPath, cwd, workingTree, { include: [] }),
        '',
      );
    } finally {
      fs.rmSync(large);
    }
  });

  test('leaves an untracked file it cannot read out of the full patch', async () => {
    const gone = path.join(cwd, 'gone.txt');
    fs.writeFileSync(gone, 'gone\n');
    try {
      const workingTree = await workingTreeFiles(gitPath, cwd);
      fs.rmSync(gone);
      const patch = await workingTreePatch(gitPath, cwd, workingTree);
      assert.ok(patch.includes('+two'), patch);
      assert.ok(patch.includes('+new'), patch);
      assert.ok(!patch.includes('gone.txt'), patch);
    } finally {
      if (fs.existsSync(gone)) {
        fs.rmSync(gone);
      }
    }
  });

  test('counts a last line without a newline, and no lines of binary or empty untracked files', async () => {
    const files: Record<string, string | Buffer> = {
      'partial.txt': 'a\nb',
      'binary.dat': Buffer.from([0, 1, 2]),
      'empty.txt': '',
    };
    for (const [file, content] of Object.entries(files)) {
      fs.writeFileSync(path.join(cwd, file), content);
    }
    try {
      const { files: changes } = await workingTreeFiles(gitPath, cwd);
      assert.deepStrictEqual(
        Object.keys(files).map(
          (file) => changes.find((change) => change.path === file)?.insertions,
        ),
        [2, 0, 0],
      );
    } finally {
      for (const file of Object.keys(files)) {
        fs.rmSync(path.join(cwd, file));
      }
    }
  });

  test('counts an untracked text file over 2 MB as a large change too large to count, rather than reading it whole to count its lines, and a huge binary one as no lines', async () => {
    const files: Record<string, string | Buffer> = {
      'huge.txt': 'x\n'.repeat(1024 * 1024) + 'x',
      'exact.txt': 'x\n'.repeat(1024 * 1024),
      'huge.dat': Buffer.alloc(3 * 1024 * 1024),
    };
    for (const [file, content] of Object.entries(files)) {
      fs.writeFileSync(path.join(cwd, file), content);
    }
    try {
      const { files: changes } = await workingTreeFiles(gitPath, cwd);
      const [text, binary] = ['huge.txt', 'huge.dat'].map((file) =>
        changes.find((change) => change.path === file),
      );
      assert.ok(text && isLargeChange(text));
      assert.strictEqual(text.uncounted, true);
      assert.strictEqual(text.insertions, 0);
      assert.strictEqual(binary?.insertions, 0);
      assert.strictEqual(binary?.uncounted, undefined);
      const exact = changes.find((change) => change.path === 'exact.txt');
      assert.strictEqual(exact?.insertions, 1024 * 1024);
      assert.strictEqual(exact?.uncounted, undefined);
    } finally {
      for (const file of Object.keys(files)) {
        fs.rmSync(path.join(cwd, file));
      }
    }
  });

  test('counts an untracked symlink as the one line git diffs it as, its target', async (context) => {
    const target = path.join(cwd, 'target.txt');
    const link = path.join(cwd, 'link');
    symlinkOrSkip(context, 'target.txt', link);
    fs.writeFileSync(target, 'a\nb\n');
    try {
      const { files } = await workingTreeFiles(gitPath, cwd);
      assert.strictEqual(
        files.find((change) => change.path === 'link')?.insertions,
        1,
      );
    } finally {
      fs.rmSync(link);
      fs.rmSync(target);
    }
  });

  test('counts and diffs only the first 50 untracked files, against the index or a commit either way, leaving the rest out of the patch to load when opened, as each one is read on its own to count its lines and diffed by a git of its own', async () => {
    const many = path.join(cwd, 'many');
    fs.mkdirSync(many);
    for (let i = 0; i <= 50; i++) {
      fs.writeFileSync(
        path.join(many, `f${String(i).padStart(2, '0')}.txt`),
        `many${i}\n`,
      );
    }
    try {
      for (const diff of [
        undefined,
        { base: 'HEAD', reverse: false },
        { base: 'HEAD', reverse: true },
      ]) {
        const workingTree = await workingTreeFiles(gitPath, cwd, diff);
        const lines = (file: string) => {
          const change = workingTree.files.find((one) => one.path === file);
          return change && change.insertions + change.deletions;
        };
        assert.strictEqual(lines('many/f49.txt'), 1);
        assert.strictEqual(lines('many/f50.txt'), 0);
        assert.deepStrictEqual(
          leftOutChanges(workingTree.files).filter((file) =>
            file.path.startsWith('many/'),
          ),
          [{ path: 'many/f50.txt', lines: undefined }],
        );
        const patch = await workingTreePatch(gitPath, cwd, workingTree, {
          include: ['many/f49.txt', 'many/f50.txt'],
        });
        assert.ok(patch.includes('many49'), patch);
        assert.ok(!patch.includes('many50'), patch);
        const alone = await workingTreePatch(gitPath, cwd, workingTree, {
          path: 'many/f50.txt',
        });
        assert.ok(alone.includes('many50'), alone);
      }
    } finally {
      fs.rmSync(many, { recursive: true });
    }
  });

  test('diffs an untracked file again only once it changed on disk', async () => {
    const draft = path.join(cwd, 'draft.txt');
    fs.writeFileSync(draft, 'first\n');
    try {
      const patches = new UntrackedPatches(Infinity);
      const workingTree = await workingTreeFiles(gitPath, cwd);
      const first = await workingTreePatch(
        gitPath,
        cwd,
        workingTree,
        {},
        patches,
      );
      assert.ok(first.includes('+first'), first);
      for (const [file, { stamp }] of new Map(patches)) {
        patches.set(file, { stamp, patch: `kept ${file}\n` });
      }
      const kept = await workingTreePatch(
        gitPath,
        cwd,
        workingTree,
        {},
        patches,
      );
      assert.ok(kept.includes('kept draft.txt'), kept);
      assert.ok(kept.includes('kept untracked.txt'), kept);
      assert.ok(kept.includes('+two'), kept);
      assert.strictEqual(
        await workingTreePatch(
          gitPath,
          cwd,
          workingTree,
          { path: 'draft.txt' },
          patches,
        ),
        'kept draft.txt\n',
      );
      fs.writeFileSync(draft, 'second line\n');
      const changed = await workingTreePatch(
        gitPath,
        cwd,
        workingTree,
        {},
        patches,
      );
      assert.ok(changed.includes('+second line'), changed);
      assert.ok(changed.includes('kept untracked.txt'), changed);
    } finally {
      fs.rmSync(draft);
    }
  });

  test('forgets the patch kept of an untracked file the list no longer has', async () => {
    const draft = path.join(cwd, 'draft.txt');
    fs.writeFileSync(draft, 'draft\n');
    try {
      const patches = new UntrackedPatches(Infinity);
      const workingTree = await workingTreeFiles(gitPath, cwd);
      await workingTreePatch(gitPath, cwd, workingTree, {}, patches);
      assert.ok(patches.has('draft.txt'));
      const listed = {
        ...workingTree,
        files: workingTree.files.filter((file) => file.path !== 'draft.txt'),
        untracked: workingTree.untracked.filter((file) => file !== 'draft.txt'),
      };
      await workingTreePatch(gitPath, cwd, listed, {}, patches);
      assert.deepStrictEqual([...patches.keys()], ['untracked.txt']);
    } finally {
      fs.rmSync(draft);
    }
  });

  test('keeps no patch of an untracked file over 2 MB, diffing it again on every refresh, but keeps that of one of exactly 2 MB', async () => {
    const files = {
      'large.log': `${'x'.repeat(2 * 1024 * 1024)}\n`,
      'exact.log': `${'x'.repeat(2 * 1024 * 1024 - 1)}\n`,
    };
    for (const [file, content] of Object.entries(files)) {
      fs.writeFileSync(path.join(cwd, file), content);
    }
    try {
      const patches = new UntrackedPatches(Infinity);
      const workingTree = await workingTreeFiles(gitPath, cwd);
      for (const file of Object.keys(files)) {
        const patch = await workingTreePatch(
          gitPath,
          cwd,
          workingTree,
          { path: file },
          patches,
        );
        assert.ok(patch.includes('+xxx'));
      }
      assert.ok(!patches.has('large.log'));
      assert.ok(patches.has('exact.log'));
    } finally {
      for (const file of Object.keys(files)) {
        fs.rmSync(path.join(cwd, file));
      }
    }
  });

  test('forgets the patches of the untracked files used least recently once they pass its size', async () => {
    const files = ['kept-a.txt', 'kept-b.txt', 'kept-c.txt'];
    for (const file of files) {
      fs.writeFileSync(path.join(cwd, file), 'same\n');
    }
    try {
      const workingTree = await workingTreeFiles(gitPath, cwd);
      const alone = (file: string, patches?: UntrackedPatches) =>
        workingTreePatch(gitPath, cwd, workingTree, { path: file }, patches);
      const patches = new UntrackedPatches(
        (await alone('kept-a.txt')).length * 2,
      );
      for (const file of [
        'kept-a.txt',
        'kept-b.txt',
        'kept-a.txt',
        'kept-c.txt',
      ]) {
        await alone(file, patches);
      }
      assert.deepStrictEqual([...patches.keys()], ['kept-a.txt', 'kept-c.txt']);
    } finally {
      for (const file of files) {
        fs.rmSync(path.join(cwd, file));
      }
    }
  });

  test('diffs the untracked files the list had, not ones found since', async () => {
    const workingTree = await workingTreeFiles(gitPath, cwd);
    const listed = {
      ...workingTree,
      files: workingTree.files.filter((file) => file.status !== 'U'),
      untracked: [],
    };
    const patch = await workingTreePatch(gitPath, cwd, listed);
    assert.ok(patch.includes('+two'));
    assert.ok(!patch.includes('+new'));
  });

  test("diffs an untracked file named '-' by what it holds, not by git's input", async () => {
    const dash = path.join(cwd, '-');
    fs.writeFileSync(dash, 'dashed\n');
    try {
      const workingTree = await workingTreeFiles(gitPath, cwd);
      for (const scope of [{ path: '-' }, {}]) {
        const patch = await workingTreePatch(gitPath, cwd, workingTree, scope);
        const dashed = parsePatch(patch).find((file) => file.path === '-');
        assert.ok(dashed, patch);
        assert.match(patch, /^diff --git a\/- b\/-$/m);
        assert.match(patch, /^\+dashed$/m);
      }
    } finally {
      fs.rmSync(dash);
    }
  });

  test('stops when cancelled', async () => {
    const workingTree = await workingTreeFiles(gitPath, cwd);
    const controller = new AbortController();
    controller.abort();
    const { signal } = controller;
    await assert.rejects(workingTreeFiles(gitPath, cwd, undefined, signal));
    for (const scope of [
      {},
      { path: 'tracked.txt' },
      { path: 'untracked.txt' },
    ]) {
      const patches = new UntrackedPatches(Infinity);
      await assert.rejects(
        workingTreePatch(gitPath, cwd, workingTree, scope, patches, signal),
      );
      assert.strictEqual(patches.size, 0);
    }
  });
});

suite('Comparing a commit with the working tree', () => {
  let repository: TempRepository;
  let first: string;

  beforeAll(async () => {
    repository = await tempRepository(tempFolder('compare-working-tree'));
    await repository.commit('first', { 'kept.txt': 'one\n' });
    await repository.commit('second', {
      'kept.txt': 'two\n',
      'later.txt': 'later\n',
    });
    [first] = await repository.resolve('HEAD~1');
    fs.writeFileSync(path.join(repository.root, 'kept.txt'), 'three\n');
    fs.writeFileSync(path.join(repository.root, 'new.txt'), 'new\n');
  });

  afterAll(() => removeFolder(repository.root));

  test('lists the comparison from the untracked files a listing of the working tree found, without asking git for them again, as listing it anew would', async () => {
    await repository.git('rm', '-q', '--cached', 'kept.txt');
    try {
      const listing = await workingTreeFiles(
        repository.gitPath,
        repository.root,
      );
      for (const reverse of [false, true]) {
        const diff = { base: first, reverse };
        const fresh = await workingTreeFiles(
          repository.gitPath,
          repository.root,
          diff,
        );
        const recording = holdingGit(() => false);
        try {
          const reused = await workingTreeFiles(
            repository.gitPath,
            repository.root,
            diff,
            undefined,
            listing.listedUntracked,
          );
          assert.deepStrictEqual(reused, fresh);
          assert.ok(!recording.started('--untracked-files=all'));
          assert.ok(!recording.started('--others'));
        } finally {
          recording.release();
        }
      }
    } finally {
      await repository.git('reset', '-q', '--', 'kept.txt');
    }
  });

  test('diffs from the commit to the files on disk', async () => {
    const workingTree = await workingTreeFiles(
      repository.gitPath,
      repository.root,
      { base: first, reverse: false },
    );
    assert.deepStrictEqual(
      workingTree.files.map((file) => [
        file.status,
        file.path,
        file.insertions,
        file.deletions,
      ]),
      [
        ['M', 'kept.txt', 1, 1],
        ['A', 'later.txt', 1, 0],
        ['U', 'new.txt', 1, 0],
      ],
    );
    const patch = await workingTreePatch(
      repository.gitPath,
      repository.root,
      workingTree,
    );
    assert.match(patch, /^-one$/m);
    assert.match(patch, /^\+three$/m);
    assert.match(patch, /^\+new$/m);
  });

  test('diffs from the files on disk to the commit, an untracked file as deleted', async () => {
    const workingTree = await workingTreeFiles(
      repository.gitPath,
      repository.root,
      { base: first, reverse: true },
    );
    assert.deepStrictEqual(
      workingTree.files.map((file) => [
        file.status,
        file.path,
        file.insertions,
        file.deletions,
      ]),
      [
        ['M', 'kept.txt', 1, 1],
        ['D', 'later.txt', 0, 1],
        ['D', 'new.txt', 0, 1],
      ],
    );
    assert.ok(workingTree.files.every((file) => (file.bytes ?? 0) > 0));
    const patch = await workingTreePatch(
      repository.gitPath,
      repository.root,
      workingTree,
    );
    assert.deepStrictEqual(
      parsePatch(patch).map((file) => file.path),
      ['kept.txt', 'later.txt', 'new.txt'],
    );
    assert.match(patch, /^-three$/m);
    assert.match(patch, /^\+one$/m);
    assert.match(patch, /^-new$/m);
    const alone = await workingTreePatch(
      repository.gitPath,
      repository.root,
      workingTree,
      { path: 'new.txt' },
    );
    assert.match(alone, /^-new$/m);
  });

  test('diffs an untracked file again when the direction changes, not reusing the patch kept', async () => {
    const patches = new UntrackedPatches(Infinity);
    const patchOf = async (reverse: boolean) =>
      workingTreePatch(
        repository.gitPath,
        repository.root,
        await workingTreeFiles(repository.gitPath, repository.root, {
          base: first,
          reverse,
        }),
        { path: 'new.txt' },
        patches,
      );
    assert.match(await patchOf(false), /^\+new$/m);
    assert.match(await patchOf(true), /^-new$/m);
    assert.match(await patchOf(false), /^\+new$/m);
  });

  test('leaves out a file only touched on disk, in either direction', async () => {
    const file = path.join(repository.root, 'later.txt');
    const past = new Date(Date.UTC(2020, 0, 1));
    fs.utimesSync(file, past, past);
    try {
      for (const reverse of [false, true]) {
        const { files } = await workingTreeFiles(
          repository.gitPath,
          repository.root,
          { base: 'HEAD', reverse },
        );
        assert.deepStrictEqual(
          files.map((change) => change.path),
          ['kept.txt', 'new.txt'],
        );
      }
    } finally {
      const now = new Date();
      fs.utimesSync(file, now, now);
    }
  });
});

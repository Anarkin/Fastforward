import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, suite, test } from 'vitest';
import {
  stagedPatch,
  uncommittedCount,
  withoutTouched,
  workingTreeFiles,
  workingTreePatch,
  type WorkingTree,
} from '../../../../../tools/git/main/workingTree';
import { waitFor } from '../../../../helpers/fixtures';
import {
  removeFolder,
  tempFolder,
  tempRepository,
  type TempRepository,
} from '../../../../helpers/repositories';
import { holdingGit } from './workingTreeFixtures';

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

  test('lists staged files as added, and untracked ones, and all the changes against the empty tree, as there is no HEAD yet', async () => {
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
    const { all } = workingTree;
    assert.ok(all);
    assert.deepStrictEqual(
      all.files.map((file) => [file.status, file.path]),
      [
        ['A', 'staged.txt'],
        ['U', 'untracked.txt'],
      ],
    );
    const allPatch = await workingTreePatch(gitPath, cwd, all, {
      path: 'staged.txt',
    });
    assert.match(allPatch, /^\+one$/m);
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
  let listedAtStart: WorkingTree;
  let listing: ReturnType<typeof holdingGit>;

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
    listing = holdingGit(() => false);
    try {
      listedAtStart = await workingTreeFiles(
        repository.gitPath,
        repository.root,
      );
    } finally {
      listing.release();
    }
  });

  afterAll(() => removeFolder(repository.root));

  test('lists the staged changes apart from the unstaged ones, which it diffs against the index', () => {
    assert.deepStrictEqual(
      listedAtStart.staged?.map((file) => [file.status, file.path]),
      [
        ['M', 'both.txt'],
        ['M', 'staged.txt'],
        ['D', 'uncached.txt'],
      ],
    );
    assert.deepStrictEqual(
      listedAtStart.files.map((file) => [file.status, file.path]),
      [
        ['M', 'both.txt'],
        ['M', 'unstaged.txt'],
        ['U', 'new.txt'],
        ['U', 'uncached.txt'],
      ],
    );
    assert.strictEqual(uncommittedCount(listedAtStart), 5);
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

  test('reads no file again to tell whether it was only touched once git counted lines changed in it', () => {
    assert.ok(!listing.started('hash-object'));
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
      listedAtStart,
      { path: 'both.txt' },
    );
    assert.match(unstaged, /^-two$/m);
    assert.match(unstaged, /^\+three$/m);
  });

  test('lists every change since HEAD too, once a file, a file changed again since it was staged with its whole change, for All Changes', async () => {
    const { all } = listedAtStart;
    assert.ok(all);
    assert.deepStrictEqual(
      all.files.map((file) => [file.status, file.path]),
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
      all,
      { path: 'both.txt' },
    );
    assert.match(patch, /^-one$/m);
    assert.match(patch, /^\+three$/m);
    assert.doesNotMatch(patch, /two/);
  });

  test('lists no changes since HEAD when only counting the changes, or when comparing the working tree with a commit, as All Changes then shows none or those already listed', async () => {
    const counted = await workingTreeFiles(
      repository.gitPath,
      repository.root,
      undefined,
      undefined,
      undefined,
      false,
    );
    assert.strictEqual(counted.all, undefined);
    const compared = await workingTreeFiles(
      repository.gitPath,
      repository.root,
      { base: 'HEAD', reverse: false },
    );
    assert.strictEqual(compared.all, undefined);
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

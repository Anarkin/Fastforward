import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getGitApi } from '../git/repository';
import { remoteDefaultBranches } from '../git/branches';
import { showPatch } from '../git/diff';
import { listTree, readFile } from '../git/files';
import { headCommit, listHistory } from '../git/history';
import { workingTreeFiles, workingTreePatch } from '../git/workingTree';
import {
  removeFolder,
  tempFolder,
  tempRepository,
  type TempRepository,
} from './repositories';

suite('A repository without commits', function () {
  this.timeout(20_000);
  let gitPath: string;
  let cwd: string;

  suiteSetup(async () => {
    gitPath = (await getGitApi()).git.path;
    const repository = await tempRepository(tempFolder('empty'));
    cwd = repository.root;
    fs.writeFileSync(path.join(cwd, 'staged.txt'), 'one\n');
    await repository.git('add', 'staged.txt');
    fs.writeFileSync(path.join(cwd, 'untracked.txt'), 'new\n');
  });

  suiteTeardown(() => removeFolder(cwd));

  test('has no HEAD and an empty history', async () => {
    assert.strictEqual(await headCommit(gitPath, cwd), undefined);
    assert.deepStrictEqual(await listHistory(gitPath, cwd), []);
  });

  test('lists staged files as added, and untracked ones', async () => {
    const workingTree = await workingTreeFiles(gitPath, cwd);
    assert.deepStrictEqual(
      workingTree.files.map((file) => [file.status, file.path]),
      [
        ['A', 'staged.txt'],
        ['U', 'untracked.txt'],
      ],
    );
    const patch = await workingTreePatch(gitPath, cwd, workingTree, {
      path: 'staged.txt',
    });
    assert.ok(patch.includes('+one'), patch);
  });
});

suite('Uncommitted changes', function () {
  this.timeout(20_000);
  let gitPath: string;
  let cwd: string;

  suiteSetup(async () => {
    gitPath = (await getGitApi()).git.path;
    const repository = await tempRepository(tempFolder('changes'));
    cwd = repository.root;
    await repository.commit('initial', { 'tracked.txt': 'one\n' });
    fs.writeFileSync(path.join(cwd, 'tracked.txt'), 'two\n');
    fs.writeFileSync(path.join(cwd, 'untracked.txt'), 'new\n');
    const nested = await tempRepository(path.join(cwd, 'nested'));
    fs.writeFileSync(path.join(nested.root, 'inner.txt'), 'inner\n');
  });

  suiteTeardown(() => removeFolder(cwd));

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

  test('counts the lines of untracked files, and leaves large ones out when asked', async () => {
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
        exclude: ['large.txt'],
      });
      assert.ok(patch.includes('+new'), patch);
      assert.ok(!patch.includes('+line'), patch);
    } finally {
      fs.rmSync(large);
    }
  });

  test('diffs the untracked files the list had, not ones found since', async () => {
    const workingTree = await workingTreeFiles(gitPath, cwd);
    const listed = {
      ...workingTree,
      files: workingTree.files.filter((file) => file.status !== 'U'),
    };
    const patch = await workingTreePatch(gitPath, cwd, listed);
    assert.ok(patch.includes('+two'));
    assert.ok(!patch.includes('+new'));
  });
});

suite('Repository files', function () {
  this.timeout(20_000);
  let gitPath: string;
  let repository: TempRepository;
  let cwd: string;

  suiteSetup(async () => {
    gitPath = (await getGitApi()).git.path;
    repository = await tempRepository(tempFolder('files'));
    cwd = repository.root;
    await repository.commit('initial', { 'src/tracked.txt': 'one\n' });
    fs.writeFileSync(path.join(cwd, 'src', 'tracked.txt'), 'two\n');
    fs.writeFileSync(path.join(cwd, 'untracked.txt'), 'new\n');
  });

  suiteTeardown(() => removeFolder(cwd));

  test('lists the files at a commit and in the working tree', async () => {
    assert.deepStrictEqual(await listTree(gitPath, cwd, 'HEAD'), [
      'src/tracked.txt',
    ]);
    assert.deepStrictEqual(
      (await listTree(gitPath, cwd, undefined)).toSorted(),
      ['src/tracked.txt', 'untracked.txt'],
    );
  });

  test("reads a remote's default branch", async () => {
    assert.deepStrictEqual(await remoteDefaultBranches(gitPath, cwd), []);
    await repository.git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    try {
      await repository.git(
        'symbolic-ref',
        'refs/remotes/origin/HEAD',
        'refs/remotes/origin/main',
      );
      assert.deepStrictEqual(await remoteDefaultBranches(gitPath, cwd), [
        'origin/main',
      ]);
    } finally {
      await repository.git('update-ref', '-d', 'refs/remotes/origin/main');
      await repository.git('symbolic-ref', '-d', 'refs/remotes/origin/HEAD');
    }
  });

  test('reads a file at a commit and in the working tree', async () => {
    const committed = await readFile(gitPath, cwd, 'HEAD', 'src/tracked.txt');
    assert.deepStrictEqual(committed, { content: 'one\n', binary: false });
    const current = await readFile(gitPath, cwd, undefined, 'src/tracked.txt');
    assert.strictEqual(current.content, 'two\n');
  });

  test('reads a file deleted since it was listed as empty', async () => {
    assert.deepStrictEqual(
      await readFile(gitPath, cwd, undefined, 'gone.txt'),
      {
        content: '',
        binary: false,
      },
    );
  });

  test('reads a symlink in the working tree by its target, as git does', async function () {
    const link = path.join(cwd, 'link');
    try {
      fs.symlinkSync('src/tracked.txt', link);
    } catch {
      // Windows allows symlinks only in developer mode or as an admin
      this.skip();
    }
    try {
      assert.deepStrictEqual(await readFile(gitPath, cwd, undefined, 'link'), {
        content: 'src/tracked.txt',
        binary: false,
      });
    } finally {
      fs.rmSync(link);
    }
  });
});

suite('Large files and submodules', function () {
  this.timeout(20_000);
  let gitPath: string;
  let cwd: string;
  let inner: string;
  let repository: TempRepository;
  let sub: TempRepository;

  suiteSetup(async () => {
    gitPath = (await getGitApi()).git.path;
    repository = await tempRepository(tempFolder('large'));
    cwd = repository.root;
    sub = await tempRepository(path.join(cwd, 'sub'));
    await sub.commit('inner');
    [inner] = await sub.resolve('HEAD');
    fs.writeFileSync(path.join(cwd, 'large.txt'), 'x'.repeat(3 * 1024 * 1024));
    await repository.git('add', '.');
    await repository.git('commit', '-m', 'initial');
  });

  suiteTeardown(() => removeFolder(cwd));

  test('shows a file too large to show as binary', async () => {
    const binary = { content: '', binary: true };
    assert.deepStrictEqual(
      await readFile(gitPath, cwd, 'HEAD', 'large.txt'),
      binary,
    );
    assert.deepStrictEqual(
      await readFile(gitPath, cwd, undefined, 'large.txt'),
      binary,
    );
  });

  test('shows a submodule by its commit', async () => {
    const submodule = {
      content: `Subproject commit ${inner}\n`,
      binary: false,
    };
    assert.deepStrictEqual(
      await readFile(gitPath, cwd, 'HEAD', 'sub'),
      submodule,
    );
    assert.deepStrictEqual(
      await readFile(gitPath, cwd, undefined, 'sub'),
      submodule,
    );
  });

  test('shows a submodule that is not checked out as empty', async () => {
    fs.mkdirSync(path.join(cwd, 'unchecked'));
    try {
      assert.deepStrictEqual(
        await readFile(gitPath, cwd, undefined, 'unchecked'),
        { content: '', binary: false },
      );
    } finally {
      fs.rmSync(path.join(cwd, 'unchecked'), { recursive: true });
    }
  });

  test('diffs a submodule by its commits, whatever the config says', async () => {
    await sub.commit('moved');
    await repository.git('add', 'sub');
    await repository.git('commit', '-m', 'move sub');
    await repository.git('config', 'diff.submodule', 'log');
    const patch = await showPatch(gitPath, cwd, 'HEAD', { path: 'sub' });
    assert.ok(patch.includes(`-Subproject commit ${inner}`), patch);
  });
});

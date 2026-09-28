import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { getGitApi } from '../git/repository';
import {
  headCommit,
  listHistory,
  listTree,
  readFile,
  remoteDefaultBranches,
  runGit,
  workingTreeFiles,
  workingTreePatch,
} from '../git/show';

suite('A repository without commits', function () {
  this.timeout(20_000);
  let gitPath: string;
  let cwd: string;

  suiteSetup(async () => {
    gitPath = (await getGitApi()).git.path;
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'fastforward-empty-'));
    await runGit(gitPath, cwd, ['init']);
    fs.writeFileSync(path.join(cwd, 'staged.txt'), 'one\n');
    await runGit(gitPath, cwd, ['add', 'staged.txt']);
    fs.writeFileSync(path.join(cwd, 'untracked.txt'), 'new\n');
  });

  suiteTeardown(() => {
    try {
      fs.rmSync(cwd, { recursive: true, force: true });
    } catch {
      // Left for the OS to clean up
    }
  });

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
  // git in temp repositories can take seconds on a busy machine
  this.timeout(20_000);
  let gitPath: string;
  let cwd: string;

  suiteSetup(async () => {
    gitPath = (await getGitApi()).git.path;
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'fastforward-'));
    const git = (...args: string[]) =>
      runGit(gitPath, cwd, [
        '-c',
        'user.name=Test',
        '-c',
        'user.email=test@example.com',
        ...args,
      ]);
    await git('init');
    fs.writeFileSync(path.join(cwd, 'tracked.txt'), 'one\n');
    await git('add', '.');
    await git('commit', '-m', 'initial');
    fs.writeFileSync(path.join(cwd, 'tracked.txt'), 'two\n');
    fs.writeFileSync(path.join(cwd, 'untracked.txt'), 'new\n');
    // A repository inside this one, which git lists as its folder
    const nested = path.join(cwd, 'nested');
    fs.mkdirSync(nested);
    await runGit(gitPath, nested, ['init']);
    fs.writeFileSync(path.join(nested, 'inner.txt'), 'inner\n');
  });

  // Best effort, because git's read-only object files can't always be removed
  // on Windows, and it's only a temp folder
  suiteTeardown(() => {
    try {
      fs.rmSync(cwd, { recursive: true, force: true });
    } catch {
      // Left for the OS to clean up
    }
  });

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
  // git in temp repositories can take seconds on a busy machine
  this.timeout(20_000);
  let gitPath: string;
  let cwd: string;

  suiteSetup(async () => {
    gitPath = (await getGitApi()).git.path;
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'fastforward-'));
    const git = (...args: string[]) =>
      runGit(gitPath, cwd, [
        '-c',
        'user.name=Test',
        '-c',
        'user.email=test@example.com',
        ...args,
      ]);
    await git('init');
    fs.mkdirSync(path.join(cwd, 'src'));
    fs.writeFileSync(path.join(cwd, 'src', 'tracked.txt'), 'one\n');
    await git('add', '.');
    await git('commit', '-m', 'initial');
    fs.writeFileSync(path.join(cwd, 'src', 'tracked.txt'), 'two\n');
    fs.writeFileSync(path.join(cwd, 'untracked.txt'), 'new\n');
  });

  suiteTeardown(() => {
    try {
      fs.rmSync(cwd, { recursive: true, force: true });
    } catch {
      // Left for the OS to clean up
    }
  });

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
    await runGit(gitPath, cwd, [
      'update-ref',
      'refs/remotes/origin/main',
      'HEAD',
    ]);
    await runGit(gitPath, cwd, [
      'symbolic-ref',
      'refs/remotes/origin/HEAD',
      'refs/remotes/origin/main',
    ]);
    assert.deepStrictEqual(await remoteDefaultBranches(gitPath, cwd), [
      'origin/main',
    ]);
  });

  test('reads a file at a commit and in the working tree', async () => {
    const committed = await readFile(gitPath, cwd, 'HEAD', 'src/tracked.txt');
    assert.deepStrictEqual(committed, { content: 'one\n', binary: false });
    const current = await readFile(gitPath, cwd, undefined, 'src/tracked.txt');
    assert.strictEqual(current.content, 'two\n');
  });
});

suite('Large files and submodules', function () {
  // git in temp repositories can take seconds on a busy machine
  this.timeout(20_000);
  let gitPath: string;
  let cwd: string;
  let inner: string;

  suiteSetup(async () => {
    gitPath = (await getGitApi()).git.path;
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'fastforward-'));
    const git = (dir: string, ...args: string[]) =>
      runGit(gitPath, dir, [
        '-c',
        'user.name=Test',
        '-c',
        'user.email=test@example.com',
        ...args,
      ]);
    await git(cwd, 'init');
    // Over the size shown as text, without a NUL byte that would make it
    // binary anyway
    fs.writeFileSync(path.join(cwd, 'large.txt'), 'x'.repeat(3 * 1024 * 1024));
    // A repository added inside this one is recorded as a submodule is, by
    // its commit
    const sub = path.join(cwd, 'sub');
    fs.mkdirSync(sub);
    await git(sub, 'init');
    await git(sub, 'commit', '--allow-empty', '-m', 'inner');
    inner = (await git(sub, 'rev-parse', 'HEAD')).trim();
    await git(cwd, 'add', '.');
    await git(cwd, 'commit', '-m', 'initial');
  });

  suiteTeardown(() => {
    try {
      fs.rmSync(cwd, { recursive: true, force: true });
    } catch {
      // Left for the OS to clean up
    }
  });

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
});

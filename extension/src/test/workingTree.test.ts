import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { getGitApi } from '../git/repository';
import {
  listTree,
  readFile,
  remoteDefaultBranches,
  runGit,
  workingTreeFiles,
  workingTreePatch,
} from '../git/show';

suite('Uncommitted changes', () => {
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
    const files = await workingTreeFiles(gitPath, cwd);
    assert.deepStrictEqual(
      files.map((file) => [file.status, file.path]),
      [
        ['M', 'tracked.txt'],
        ['U', 'untracked.txt'],
      ],
    );
  });

  test('includes untracked files in the full patch', async () => {
    const patch = await workingTreePatch(gitPath, cwd, undefined);
    assert.ok(patch.includes('+two'));
    assert.ok(patch.includes('+new'));
  });

  test('narrows the patch to one untracked file', async () => {
    const patch = await workingTreePatch(gitPath, cwd, 'untracked.txt');
    assert.ok(patch.includes('+new'));
    assert.ok(!patch.includes('+two'));
  });
});

suite('Repository files', () => {
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

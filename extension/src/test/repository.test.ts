import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { API, Repository } from '../git/git';
import { getGitApi, listRefs } from '../git/repository';
import {
  commitsStartingWith,
  findCommit,
  listHistory,
  logCommits,
  runGit,
  showFiles,
  showPatch,
} from '../git/show';

// A temp repository with three commits on main, the last renaming a file, so
// the tests don't depend on what this repository has checked out
suite('Git repository', function () {
  // git in temp repositories can take seconds on a busy machine
  this.timeout(20_000);
  let git: API;
  let repository: Repository;
  let cwd: string;

  suiteSetup(async () => {
    git = await getGitApi();
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'fastforward-repository-'));
    const run = (...args: string[]) =>
      runGit(git.git.path, cwd, [
        '-c',
        'user.name=Test',
        '-c',
        'user.email=test@example.com',
        ...args,
      ]);
    await run('init', '-b', 'main');
    fs.writeFileSync(path.join(cwd, 'first.txt'), 'one\n');
    await run('add', '.');
    await run('commit', '-m', 'first');
    fs.writeFileSync(path.join(cwd, 'second.txt'), 'two\n');
    await run('add', '.');
    await run('commit', '-m', 'second');
    await run('mv', 'second.txt', 'renamed.txt');
    await run('commit', '-m', 'rename');
    const opened = await git.openRepository(vscode.Uri.file(cwd));
    assert.ok(opened, 'repository not opened');
    repository = opened;
    await repository.status();
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

  test('lists refs including the current branch', async () => {
    const refs = await listRefs(repository);
    assert.ok(refs.some((ref) => ref.kind === 'branch' && ref.name === 'main'));
    assert.ok(!refs.some((ref) => ref.name.endsWith('/HEAD')));
  });

  test('lists the history, its commits, their files and patches', async () => {
    const history = await listHistory(git.git.path, cwd);
    assert.strictEqual(history.length, 3);
    assert.ok(history.every((entry) => entry.hash.length === 40));

    // Commits come back in the order of the hashes asked for
    const hashes = history.map((entry) => entry.hash);
    const commits = await logCommits(git.git.path, cwd, hashes.toReversed());
    assert.deepStrictEqual(
      commits.map((commit) => commit.subject),
      ['first', 'second', 'rename'],
    );

    // The root commit has no parents, and git show lists its files as added
    const root = history.find((entry) => entry.parents.length === 0);
    assert.ok(root);
    const files = await showFiles(git.git.path, cwd, root.hash);
    assert.deepStrictEqual(
      files.map((file) => [file.status, file.path]),
      [['A', 'first.txt']],
    );

    const patch = await showPatch(git.git.path, cwd, root.hash, {
      path: 'first.txt',
    });
    assert.ok(patch.includes('b/first.txt'));
  });

  test('finds the commits a hash starts with', async () => {
    const [rename] = await listHistory(git.git.path, cwd);
    assert.deepStrictEqual(
      await commitsStartingWith(git.git.path, cwd, rename.hash.slice(0, 7)),
      [rename.hash],
    );
    assert.deepStrictEqual(
      await commitsStartingWith(git.git.path, cwd, 'ffffff0'),
      [],
    );
    // Git needs four characters, and only hex ones make a hash
    assert.deepStrictEqual(
      await commitsStartingWith(git.git.path, cwd, rename.hash.slice(0, 3)),
      [],
    );
    assert.deepStrictEqual(
      await commitsStartingWith(git.git.path, cwd, 'main'),
      [],
    );
  });

  test('says which commit a typed hash is', async () => {
    const [rename] = await listHistory(git.git.path, cwd);
    assert.deepStrictEqual(
      await findCommit(git.git.path, cwd, rename.hash.slice(0, 7)),
      { kind: 'found', hash: rename.hash, subject: 'rename' },
    );
    assert.deepStrictEqual(await findCommit(git.git.path, cwd, 'ffffff0'), {
      kind: 'none',
    });
    // A file's object isn't a commit
    const blob = (
      await runGit(git.git.path, cwd, ['rev-parse', 'HEAD:first.txt'])
    ).trim();
    assert.deepStrictEqual(
      await findCommit(git.git.path, cwd, blob.slice(0, 7)),
      { kind: 'none' },
    );
    // Nor is a branch whose name looks like a hash, which git would read
    // first
    await runGit(git.git.path, cwd, ['branch', 'fade', 'HEAD']);
    try {
      assert.deepStrictEqual(await findCommit(git.git.path, cwd, 'fade'), {
        kind: 'none',
      });
    } finally {
      await runGit(git.git.path, cwd, ['branch', '-D', 'fade']);
    }
  });

  test('diffs a renamed file as a rename', async () => {
    const [rename] = await listHistory(git.git.path, cwd);
    const files = await showFiles(git.git.path, cwd, rename.hash);
    assert.deepStrictEqual(
      files.map((file) => [file.status, file.oldPath, file.path]),
      [['R', 'second.txt', 'renamed.txt']],
    );
    const patch = await showPatch(git.git.path, cwd, rename.hash, {
      path: 'renamed.txt',
      oldPath: 'second.txt',
    });
    assert.ok(patch.includes('rename from second.txt'), patch);
    assert.ok(!patch.includes('new file mode'), patch);
  });
});

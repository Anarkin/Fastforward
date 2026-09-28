import * as assert from 'node:assert';
import * as vscode from 'vscode';
import type { Repository } from '../git/git';
import { getGitApi, listRefs } from '../git/repository';
import {
  commitsStartingWith,
  findCommit,
  listHistory,
  logCommits,
  showFiles,
  showPatch,
} from '../git/show';
import {
  removeFolder,
  tempFolder,
  tempRepository,
  type TempRepository,
} from './repositories';

// A temp repository with three commits on main, the last renaming a file, so
// the tests don't depend on what this repository has checked out
suite('Git repository', function () {
  // git in temp repositories can take seconds on a busy machine
  this.timeout(20_000);
  let gitPath: string;
  let temp: TempRepository;
  let cwd: string;
  let repository: Repository;
  let rename: string;
  // The object of first.txt
  let blob: string;

  suiteSetup(async () => {
    const git = await getGitApi();
    gitPath = git.git.path;
    temp = await tempRepository(tempFolder('repository'));
    cwd = temp.root;
    await temp.commit('first', { 'first.txt': 'one\n' });
    await temp.commit('second', { 'second.txt': 'two\n' });
    await temp.git('mv', 'second.txt', 'renamed.txt');
    await temp.git('commit', '-m', 'rename');
    [rename, blob] = await temp.resolve('HEAD', 'HEAD:first.txt');
    const opened = await git.openRepository(vscode.Uri.file(cwd));
    assert.ok(opened, 'repository not opened');
    repository = opened;
    await repository.status();
  });

  suiteTeardown(() => removeFolder(cwd));

  test('lists refs including the current branch', async () => {
    const refs = await listRefs(repository);
    assert.ok(refs.some((ref) => ref.kind === 'branch' && ref.name === 'main'));
    assert.ok(!refs.some((ref) => ref.name.endsWith('/HEAD')));
  });

  test('lists the history, its commits, their files and patches', async () => {
    const history = await listHistory(gitPath, cwd);
    assert.strictEqual(history.length, 3);
    assert.ok(history.every((entry) => entry.hash.length === 40));

    // Commits come back in the order of the hashes asked for
    const hashes = history.map((entry) => entry.hash);
    const commits = await logCommits(gitPath, cwd, hashes.toReversed());
    assert.deepStrictEqual(
      commits.map((commit) => commit.subject),
      ['first', 'second', 'rename'],
    );

    // The root commit has no parents, and git show lists its files as added
    const root = history.find((entry) => entry.parents.length === 0);
    assert.ok(root);
    const files = await showFiles(gitPath, cwd, root.hash);
    assert.deepStrictEqual(
      files.map((file) => [file.status, file.path]),
      [['A', 'first.txt']],
    );

    const patch = await showPatch(gitPath, cwd, root.hash, {
      path: 'first.txt',
    });
    assert.ok(patch.includes('b/first.txt'));
  });

  test('finds the commits a hash starts with', async () => {
    assert.deepStrictEqual(
      await commitsStartingWith(gitPath, cwd, rename.slice(0, 7)),
      [rename],
    );
    assert.deepStrictEqual(
      await commitsStartingWith(gitPath, cwd, 'ffffff0'),
      [],
    );
    // Git needs four characters, and only hex ones make a hash
    assert.deepStrictEqual(
      await commitsStartingWith(gitPath, cwd, rename.slice(0, 3)),
      [],
    );
    assert.deepStrictEqual(await commitsStartingWith(gitPath, cwd, 'main'), []);
  });

  test('says which commit a typed hash is', async () => {
    assert.deepStrictEqual(await findCommit(gitPath, cwd, rename.slice(0, 7)), {
      kind: 'found',
      hash: rename,
      subject: 'rename',
    });
    assert.deepStrictEqual(await findCommit(gitPath, cwd, 'ffffff0'), {
      kind: 'none',
    });
    // A file's object isn't a commit
    assert.deepStrictEqual(await findCommit(gitPath, cwd, blob.slice(0, 7)), {
      kind: 'none',
    });
    // Nor is a branch whose name looks like a hash, which git would read
    // first
    await temp.git('branch', 'fade', 'HEAD');
    try {
      assert.deepStrictEqual(await findCommit(gitPath, cwd, 'fade'), {
        kind: 'none',
      });
    } finally {
      await temp.git('branch', '-D', 'fade');
    }
  });

  test('diffs a renamed file as a rename', async () => {
    const files = await showFiles(gitPath, cwd, rename);
    assert.deepStrictEqual(
      files.map((file) => [file.status, file.oldPath, file.path]),
      [['R', 'second.txt', 'renamed.txt']],
    );
    const patch = await showPatch(gitPath, cwd, rename, {
      path: 'renamed.txt',
      oldPath: 'second.txt',
    });
    assert.ok(patch.includes('rename from second.txt'), patch);
    assert.ok(!patch.includes('new file mode'), patch);
  });
});

import * as assert from 'node:assert';
import * as vscode from 'vscode';
import type { Repository } from '../git/git';
import { getGitApi, listRefs } from '../git/repository';
import { showFiles, showPatch } from '../git/diff';
import {
  commitsStartingWith,
  findCommit,
  listHistory,
  logCommits,
} from '../git/history';
import {
  removeFolder,
  tempFolder,
  tempRepository,
  type TempRepository,
} from './repositories';

suite('Git repository', function () {
  this.timeout(20_000);
  let gitPath: string;
  let temp: TempRepository;
  let cwd: string;
  let repository: Repository;
  let rename: string;
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

    const hashes = history.map((entry) => entry.hash);
    const commits = await logCommits(gitPath, cwd, hashes.toReversed());
    assert.deepStrictEqual(
      commits.map((commit) => commit.subject),
      ['first', 'second', 'rename'],
    );

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
    assert.deepStrictEqual(await findCommit(gitPath, cwd, blob.slice(0, 7)), {
      kind: 'none',
    });
    await temp.git('branch', 'fade', 'HEAD');
    try {
      assert.deepStrictEqual(await findCommit(gitPath, cwd, 'fade'), {
        kind: 'none',
      });
    } finally {
      await temp.git('branch', '-D', 'fade');
    }
  });

  test("reads the same whatever the repository's config says", async () => {
    await temp.git('config', 'log.showRoot', 'false');
    await temp.git('config', 'i18n.logOutputEncoding', 'ISO-8859-1');
    try {
      const [root] = await temp.resolve('HEAD~2');
      assert.deepStrictEqual(
        (await showFiles(gitPath, cwd, root)).map((file) => file.path),
        ['first.txt'],
      );
      const [commit] = await logCommits(gitPath, cwd, [root]);
      assert.strictEqual(commit.files, 1);
      await temp.git(
        '-c',
        'user.name=Ádám',
        'commit',
        '--allow-empty',
        '-m',
        'é',
      );
      const [head] = await temp.resolve('HEAD');
      const [accented] = await logCommits(gitPath, cwd, [head]);
      assert.strictEqual(accented.authorName, 'Ádám');
      assert.strictEqual(accented.subject, 'é');
      await temp.git('reset', '--hard', 'HEAD~1');
    } finally {
      await temp.git('config', '--unset', 'log.showRoot');
      await temp.git('config', '--unset', 'i18n.logOutputEncoding');
    }
  });

  test('reads non-ASCII paths and blank context lines the same whatever the config says', async () => {
    await temp.git('config', 'core.quotePath', 'true');
    await temp.git('config', 'diff.suppressBlankEmpty', 'true');
    try {
      await temp.commit('add été', { 'été.txt': 'a\n\nb\n' });
      await temp.commit('change été', { 'été.txt': 'a\n\nc\n' });
      const [head] = await temp.resolve('HEAD');
      const patch = await showPatch(gitPath, cwd, head, { path: 'été.txt' });
      assert.ok(patch.includes('b/été.txt'), patch);
      assert.ok(patch.includes('\n \n'), patch);
    } finally {
      await temp.git('reset', '--hard', rename);
      await temp.git('config', '--unset', 'core.quotePath');
      await temp.git('config', '--unset', 'diff.suppressBlankEmpty');
    }
  });

  test('takes a path like [ab].md literally, not as a pattern', async () => {
    try {
      await temp.commit('add', { 'a.md': '1\n', '[ab].md': '1\n' });
      await temp.commit('change', { 'a.md': '2\n', '[ab].md': '2\n' });
      const [head] = await temp.resolve('HEAD');
      const patch = await showPatch(gitPath, cwd, head, { path: '[ab].md' });
      assert.ok(patch.includes('b/[ab].md'), patch);
      assert.ok(!patch.includes('b/a.md'), patch);
    } finally {
      await temp.git('reset', '--hard', rename);
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

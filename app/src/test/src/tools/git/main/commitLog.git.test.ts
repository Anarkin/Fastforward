import * as assert from 'node:assert';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { showFiles, showPatch } from '../../../../../tools/git/main/diff';
import { listHistory } from '../../../../../tools/git/main/history';
import { logCommits } from '../../../../../tools/git/main/commitLog';
import { runGit } from '../../../../../tools/git/main/run';
import { renamingRepository } from '../../../../helpers/gitFixtures';
import { entriesOf } from './historyFixtures';
import {
  objectId,
  type TempRepository,
} from '../../../../helpers/repositories';
import { removeFolder } from '../../../../helpers/tempFolders';

suite('Git commit log', () => {
  let gitPath: string;
  let temp: TempRepository;
  let cwd: string;
  let rename: string;

  beforeAll(async () => {
    ({ temp, rename } = await renamingRepository('commitLog'));
    gitPath = temp.gitPath;
    cwd = temp.root;
  });

  afterAll(() => removeFolder(cwd));

  test('lists the history, its commits, and the files and patch of its root commit, which has no parent to diff against', async () => {
    const history = entriesOf(await listHistory(gitPath, cwd));
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

  test('loads commits without reading the files they change, as counting their lines took 8 s instead of 0.1 s for 300 commits in a large repository', async () => {
    const [first] = await temp.resolve('HEAD~2');
    const tree = (
      await runGit(gitPath, cwd, ['mktree', '--missing'], {
        input: `100644 blob ${objectId('blob', 'lost\n')}\tlost.txt\n`,
      })
    ).trim();
    const lost = (
      await temp.git('commit-tree', tree, '-p', first, '-m', 'lost')
    ).trim();
    assert.deepStrictEqual(
      (await logCommits(gitPath, cwd, [lost])).map((commit) => commit.subject),
      ['lost'],
    );
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
    } finally {
      await temp.git('reset', '--hard', rename);
      await temp.git('config', '--unset', 'log.showRoot');
      await temp.git('config', '--unset', 'i18n.logOutputEncoding');
    }
  });
});

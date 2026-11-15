import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, suite, test } from 'vitest';
import {
  removeFolder,
  tempFolder,
  tempRepository,
  type TempRepository,
} from '../../../../helpers/repositories';
import { recordingLog, failOnErrorsLogged } from '../../../../helpers/stub';
import { closeViews, withView } from '../../../../helpers/harness';

suite('Git tool stashes', () => {
  const { log, error: logged } = recordingLog();
  failOnErrorsLogged(logged);
  let folder: string;
  let repository: TempRepository;
  let stash: string;

  beforeAll(async () => {
    folder = tempFolder('stash');
    repository = await tempRepository(path.join(folder, 'app'));
    await repository.commit('a', { 'tracked.txt': 'one\n' });
    await repository.commit('b');
    fs.writeFileSync(path.join(repository.root, 'tracked.txt'), 'two\n');
    fs.writeFileSync(path.join(repository.root, 'new.txt'), 'new\n');
    await repository.git('stash', 'push', '-q', '-u', '-m', 'kept aside');
    [stash] = await repository.resolve('stash@{0}');
  });

  afterAll(async () => {
    await closeViews();
    removeFolder(folder);
  });

  test('shows a stash on its base, and its untracked files with its changes', async () => {
    await withView(log, [repository.root], async (view) => {
      const commits = view.page.last('commits');
      assert.deepStrictEqual(
        commits?.commits.map((commit) => commit.subject),
        ['On main: kept aside', 'b', 'a'],
      );
      assert.deepStrictEqual(
        commits.graph.map((row) => row.stash ?? false),
        [true, false, false],
      );
      assert.deepStrictEqual(view.page.last('repository')?.stashes, [
        { name: 'stash@{0}', commit: stash, message: 'On main: kept aside' },
      ]);
      await view.connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: stash,
      });
      assert.deepStrictEqual(
        view.page.last('files')?.files.map((file) => [file.path, file.status]),
        [
          ['tracked.txt', 'M'],
          ['new.txt', 'U'],
        ],
      );
      assert.match(view.page.last('diff')?.patch ?? '', /^\+new$/m);
    });
  });

  test('leaves the stashes out of the history while solo', async () => {
    await withView(log, [repository.root], async (view) => {
      await view.connection.receive({
        type: 'setSolo',
        root: repository.root,
        solo: true,
      });
      assert.strictEqual(view.page.last('commits')?.total, 2);
    });
  });

  test('lists the history again once a stash is dropped', async () => {
    await withView(log, [repository.root], async (view) => {
      await repository.git('stash', 'drop', '-q');
      try {
        await view.connection.refresh();
        assert.strictEqual(view.page.last('commits')?.total, 2);
        assert.deepStrictEqual(view.page.last('repository')?.stashes, []);
      } finally {
        await repository.git('stash', 'store', '-q', '-m', 'kept aside', stash);
      }
    });
  });
});

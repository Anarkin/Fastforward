import * as assert from 'node:assert';
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
import { withNotices } from '../../../../helpers/fakePage';

suite('Git tool upstream', () => {
  const { log, error: logged } = recordingLog();
  failOnErrorsLogged(logged);
  let folder: string;
  let repository: TempRepository;
  let upstream: string;

  beforeAll(async () => {
    folder = tempFolder('upstream');
    repository = await tempRepository(path.join(folder, 'app'));
    await repository.commit('a');
    await repository.commit('b');
    const [tree] = await repository.resolve('HEAD^{tree}');
    upstream = (
      await repository.git('commit-tree', tree, '-p', 'HEAD~1', '-m', 'pushed')
    ).trim();
    await repository.git('remote', 'add', 'origin', 'https://example.com/x');
    await repository.git('update-ref', 'refs/remotes/origin/main', upstream);
    await repository.git('branch', '--set-upstream-to=origin/main');
  });

  afterAll(async () => {
    await closeViews();
    removeFolder(folder);
  });

  test('reveals the upstream of the checked-out branch when asked', async () => {
    await withView(log, [repository.root], async (view) => {
      await view.connection.receive({
        type: 'showUpstream',
        root: repository.root,
      });
      assert.strictEqual(view.page.last('reveal')?.hash, upstream);
    });
  });

  test('says why there is no upstream to show', async () => {
    await withView(log, [repository.root], async (view) => {
      await withNotices(view.page, 'info', async (messages) => {
        const ask = () =>
          view.connection.receive({
            type: 'showUpstream',
            root: repository.root,
          });
        await repository.git('branch', '--unset-upstream');
        try {
          await ask();
        } finally {
          await repository.git('branch', '--set-upstream-to=origin/main');
        }
        await repository.git('update-ref', '-d', 'refs/remotes/origin/main');
        try {
          await ask();
        } finally {
          await repository.git(
            'update-ref',
            'refs/remotes/origin/main',
            upstream,
          );
        }
        await repository.git('switch', '-q', '--detach');
        try {
          await ask();
        } finally {
          await repository.git('switch', '-q', 'main');
        }
        await view.connection.receive({
          type: 'setSolo',
          root: repository.root,
          solo: true,
        });
        await ask();
        assert.deepStrictEqual(messages, [
          '"main" has no upstream',
          '"origin/main", the upstream of "main", doesn\'t exist anymore',
          'The checked-out commit is on no branch, so it has no upstream',
          '"origin/main" is not in the history while Solo shows only that of the checked-out commit',
        ]);
        assert.strictEqual(view.page.last('reveal'), undefined);
      });
    });
  });
});

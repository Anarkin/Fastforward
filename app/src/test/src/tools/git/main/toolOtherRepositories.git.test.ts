import * as assert from 'node:assert';
import * as path from 'node:path';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { sameRoot } from '../../../../../lib/main/paths';
import { recentKey } from '../../../../../tools/git/main/storage';
import {
  removeFolder,
  tempRepository,
  type TempRepository,
} from '../../../../helpers/repositories';
import { recordingLog } from '../../../../helpers/stub';
import {
  closeViews,
  failOnErrorsLogged,
  FakeHost,
  reopen,
  withView,
  tabOf,
  shownTabs,
  gitState,
} from '../../../../helpers/harness';
import { viewRepositories } from '../../../../helpers/gitFixtures';
import { keptOf, keepAll } from './toolOtherRepositoriesFixtures';

suite('Git tool of other repositories', () => {
  let folder: string;
  let repository: TempRepository;
  let other: string;
  let otherHead: string;

  const { log, error: logged } = recordingLog();
  failOnErrorsLogged(logged);

  beforeAll(async () => {
    ({ folder, repository, other, otherHead } = await viewRepositories());
  });

  afterAll(async () => {
    await closeViews();
    removeFolder(folder);
  });

  test('opens the repositories picked in new tabs, showing the last one', async () => {
    const third = await tempRepository(path.join(folder, 'third'));
    await third.commit('third');
    const host = new FakeHost();
    host.folders = [third.root, third.root, other];
    await withView(
      log,
      [repository.root],
      async (view) => {
        await view.connection.receive({ type: 'browseRepositories' });
        const shown = shownTabs(view.page);
        assert.deepStrictEqual(
          shown?.tabs.map((tab) => tab.name),
          ['main', 'third', 'other'],
        );
        assert.ok(shown.active && sameRoot(shown.active, other));
        assert.strictEqual(view.page.last('repository')?.headCommit, otherHead);
        const recent = gitState(view.store).get(recentKey);
        assert.ok(Array.isArray(recent));
        for (const root of [third.root, other]) {
          assert.ok(
            recent.some((saved) => sameRoot(saved, root)),
            root,
          );
        }
      },
      true,
      host,
    );
  });

  test('forgets a recent repository on asking, telling the page the list without it', async () => {
    const gone = path.join(folder, 'gone-for-good');
    await withView(log, [repository.root], async (view) => {
      await gitState(view.store).update(recentKey, [gone, repository.root]);
      await view.connection.receive({ type: 'forgetRecent', root: gone });
      assert.deepStrictEqual(gitState(view.store).get(recentKey), [
        repository.root,
      ]);
      assert.ok(
        shownTabs(view.page)?.recent.every(
          (shown) => !sameRoot(shown.root, gone),
        ),
      );
    });
  });

  test('forgets the bookmarks, remote tags, last fetch and solo of a repository once it is neither recent nor in a tab, keeping those of one only closed', async () => {
    await withView(log, [repository.root, other], async (view) => {
      await keepAll(view.store, [repository.root, other]);
      await gitState(view.store).update(recentKey, [repository.root, other]);
      await view.connection.receive({
        type: 'closeTab',
        tab: tabOf(view.page, other),
      });
      const closed = keptOf(view.store);
      assert.ok(
        closed.every(
          (roots) => roots.includes(other) && roots.includes(repository.root),
        ),
        JSON.stringify(closed),
      );
      await view.connection.receive({ type: 'forgetRecent', root: other });
      const forgotten = keptOf(view.store);
      assert.ok(
        forgotten.every(
          (roots) => !roots.includes(other) && roots.includes(repository.root),
        ),
        JSON.stringify(forgotten),
      );
    });
  });

  test('forgets what it keeps of a repository pushed out of the recent ones by another, but not of one in a tab', async () => {
    await withView(
      log,
      [repository.root],
      async (view) => {
        const older = Array.from({ length: 48 }, (_, index) =>
          path.join(folder, `pushed-${index}`),
        );
        const pushedOut = path.join(folder, 'pushed-out');
        await keepAll(view.store, [pushedOut, other]);
        await gitState(view.store).update(recentKey, [
          ...older,
          other,
          pushedOut,
        ]);
        await view.connection.receive({ type: 'ready' });
        const kept = keptOf(view.store);
        assert.ok(
          kept.every(
            (roots) => roots.includes(other) && !roots.includes(pushedOut),
          ),
          JSON.stringify(kept),
        );
      },
      false,
    );
  });

  for (const [opened, tabs] of [
    ['a tab', () => [repository.root]],
    ['no tab', () => []],
  ] as const) {
    test(`opens the repository picked in the page loaded again while the folder dialog was open, with ${opened} shown`, async () => {
      const picked = Promise.withResolvers<readonly string[]>();
      const host = new FakeHost();
      host.chooseFolders = () => picked.promise;
      await withView(
        log,
        tabs(),
        async (view) => {
          const browsing = view.connection.receive({
            type: 'browseRepositories',
          });
          view.connection.dispose();
          const reloaded = reopen(view.view);
          try {
            await reloaded.ready;
            picked.resolve([other]);
            await browsing;
            const shown = shownTabs(reloaded.page);
            assert.ok(shown?.active && sameRoot(shown.active, other));
            assert.strictEqual(
              reloaded.page.last('repository')?.headCommit,
              otherHead,
            );
            assert.strictEqual(reloaded.page.last('commits')?.total, 1);
          } finally {
            reloaded.connection.dispose();
          }
        },
        true,
        host,
      );
    });
  }

  test('logs what the page sends at its level, marked as from the webview', async () => {
    const recording = recordingLog();
    await withView(recording.log, [], async (view) => {
      await view.connection.receive({
        type: 'log',
        level: 'info',
        message: 'from the page',
      });
      await view.connection.receive({
        type: 'log',
        level: 'error',
        message: 'failed in the page',
      });
      assert.ok(recording.info.includes('Webview: from the page'));
      assert.deepStrictEqual(recording.error, ['Webview: failed in the page']);
    });
  });
});

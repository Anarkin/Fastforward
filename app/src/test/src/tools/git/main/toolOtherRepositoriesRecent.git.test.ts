import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { plainOf } from '../../../../../lib/shared/sentences';
import { strings } from '../../../../../lib/shared/strings';
import { sameRoot } from '../../../../../lib/main/paths';
import { recentKey } from '../../../../../tools/git/main/storage';
import {
  asIfOwnedByAnother,
  removeFolder,
  tempFolder,
  type TempRepository,
} from '../../../../helpers/repositories';
import {
  recordingLog,
  failOnErrorsLogged,
  takeErrorsLogged,
} from '../../../../helpers/stub';
import {
  closeViews,
  withView,
  tabOf,
  shownTabs,
  gitState,
} from '../../../../helpers/harness';
import { viewRepositories } from '../../../../helpers/gitFixtures';
import { keptOf, keepAll } from './toolOtherRepositoriesFixtures';
import { FakeHost } from '../../../../helpers/fakeHost';

suite('Git tool of other repositories', () => {
  let folder: string;
  let repository: TempRepository;
  let other: string;

  const { log, error: logged } = recordingLog();
  failOnErrorsLogged(logged);

  beforeAll(async () => {
    ({ folder, repository, other } = await viewRepositories());
  });

  afterAll(async () => {
    await closeViews();
    removeFolder(folder);
  });

  test('opens a repository by a folder inside it', async () => {
    const inner = path.join(other, 'inner');
    fs.mkdirSync(inner, { recursive: true });
    const host = new FakeHost();
    host.folders = [inner];
    await withView(
      log,
      [repository.root],
      async (view) => {
        await view.connection.receive({ type: 'browseRepositories' });
        const shown = shownTabs(view.page);
        assert.deepStrictEqual(
          shown?.tabs.map((tab) => tab.name),
          ['main', 'other'],
        );
      },
      true,
      host,
    );
  });

  test('opens nothing when the folder dialog is cancelled', async () => {
    await withView(log, [repository.root], async (view) => {
      view.page.clear();
      await view.connection.receive({ type: 'browseRepositories' });
      assert.deepStrictEqual(
        shownTabs(view.page)?.tabs.map((tab) => tab.name),
        ['main'],
      );
      assert.strictEqual(view.page.last('notice'), undefined);
    });
  });

  test('offers as many recent repositories not open in a tab as the settings say, telling the page again once they change', async () => {
    await withView(log, [repository.root], async (view) => {
      const older = Array.from({ length: 19 }, (_, index) =>
        path.join(folder, `older-${index}`),
      );
      await gitState(view.store).update(recentKey, [repository.root, ...older]);
      await view.connection.receive({
        type: 'forgetRecent',
        root: path.join(folder, 'never-recent'),
      });
      assert.deepStrictEqual(
        shownTabs(view.page)?.recent.map((recent) => recent.root),
        older.slice(0, 15),
      );
      await view.settings.setTabs('recentFolders', 2);
      view.shell.reloadSettings();
      assert.deepStrictEqual(
        shownTabs(view.page)?.recent.map((recent) => recent.root),
        older.slice(0, 2),
      );
    });
  });

  test('offers the recent repositories that are not open in a tab, counting only those towards how many it offers', async () => {
    await withView(log, [repository.root], async (view) => {
      await gitState(view.store).update(recentKey, [other, repository.root]);
      await view.connection.receive({
        type: 'forgetRecent',
        root: path.join(folder, 'never-recent'),
      });
      assert.deepStrictEqual(shownTabs(view.page)?.recent, [
        { root: other, name: 'other' },
      ]);
      const older = Array.from({ length: 19 }, (_, index) =>
        path.join(folder, `older-${index}`),
      );
      await gitState(view.store).update(recentKey, [
        repository.root,
        ...older,
        other,
      ]);
      await view.connection.receive({ type: 'openRepository', root: other });
      const shown = shownTabs(view.page);
      assert.ok(shown?.active && sameRoot(shown.active, other));
      assert.deepStrictEqual(
        shown.recent.map((recent) => recent.root),
        older.slice(0, 15),
      );
    });
  });

  test('opens only the recent repositories the page names', async () => {
    await withView(log, [repository.root], async (view) => {
      await gitState(view.store).update(recentKey, []);
      await view.connection.receive({ type: 'openRepository', root: other });
      assert.deepStrictEqual(
        shownTabs(view.page)?.tabs.map((tab) => tab.name),
        ['main'],
      );
      assert.deepStrictEqual(gitState(view.store).get(recentKey), []);
    });
  });

  test('forgets a recent folder that is no longer a repository, and says so', async () => {
    const gone = tempFolder('gone');
    try {
      await withView(log, [repository.root], async (view) => {
        await gitState(view.store).update(recentKey, [gone, other]);
        await view.connection.receive({ type: 'openRepository', root: gone });
        assert.match(
          plainOf(view.page.last('notice')?.message ?? ''),
          /is not in a git repository$/,
        );
        assert.deepStrictEqual(gitState(view.store).get(recentKey), [other]);
        assert.deepStrictEqual(
          shownTabs(view.page)?.tabs.map((tab) => tab.name),
          ['main'],
        );
      });
    } finally {
      removeFolder(gone);
    }
  });

  test('keeps a recent repository whose folder cannot be reached, with its bookmarks and all else kept of it, saying so, as an unplugged drive or a share offline comes back', async () => {
    const unplugged = path.join(folder, 'unplugged', 'repository');
    await withView(log, [repository.root], async (view) => {
      await keepAll(view.store, [repository.root, unplugged]);
      await gitState(view.store).update(recentKey, [unplugged, other]);
      await view.connection.receive({
        type: 'openRepository',
        root: unplugged,
      });

      assert.deepStrictEqual(
        view.page.last('notice')?.message,
        strings.messages.couldNotOpen(unplugged, strings.messages.unreachable),
      );
      assert.deepStrictEqual(gitState(view.store).get(recentKey), [
        unplugged,
        other,
      ]);
      assert.ok(
        keptOf(view.store).every((roots) => roots.includes(unplugged)),
        JSON.stringify(keptOf(view.store)),
      );
      assert.deepStrictEqual(
        shownTabs(view.page)?.tabs.map((tab) => tab.name),
        ['main'],
      );
    });
  });

  test('keeps a recent repository git refuses to open, and says what git said', async () => {
    await withView(log, [repository.root], async (view) => {
      await gitState(view.store).update(recentKey, [other]);
      await asIfOwnedByAnother(other, () =>
        view.connection.receive({ type: 'openRepository', root: other }),
      );
      assert.match(
        plainOf(view.page.last('notice')?.message ?? ''),
        /^Couldn't open ".*other"\. fatal: detected dubious ownership/,
      );
      assert.deepStrictEqual(gitState(view.store).get(recentKey), [other]);
      assert.deepStrictEqual(
        shownTabs(view.page)?.tabs.map((tab) => tab.name),
        ['main'],
      );
    });
    takeErrorsLogged(
      logged,
      /^Opening .*other failed$/,
      /^git rev-parse .* failed: fatal: detected dubious ownership/,
    );
  });

  test('closes the only tab, leaving none shown but offering it again', async () => {
    await withView(log, [repository.root], async (view) => {
      for (const tab of shownTabs(view.page)?.tabs ?? []) {
        await view.connection.receive({
          type: 'closeTab',
          tab: tabOf(view.page, tab.root),
        });
      }
      assert.deepStrictEqual(shownTabs(view.page), {
        tabs: [],
        active: undefined,
        worktree: undefined,
        worktrees: [],
        recent: [{ root: repository.root, name: 'main' }],
      });
      assert.deepStrictEqual(view.page.last('bookmarks')?.bookmarks, []);
      assert.strictEqual(view.page.last('error'), undefined);
    });
  });
});

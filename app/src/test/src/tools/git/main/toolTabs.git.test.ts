import * as assert from 'node:assert';
import { createServer } from 'node:http';
import * as path from 'node:path';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  suite,
  test,
} from 'vitest';
import { replaceBuiltin } from '../../../../helpers/builtins';
import { sameRoot } from '../../../../../lib/main/paths';
import { tabsKey } from '../../../../../shell/main/storage';
import { soloKey } from '../../../../../tools/git/main/storage';
import { waitFor } from '../../../../helpers/fixtures';
import {
  tempRepository,
  type TempRepository,
} from '../../../../helpers/repositories';
import {
  recordingLog,
  failOnErrorsLogged,
  takeErrorsLogged,
} from '../../../../helpers/stub';
import {
  closeViews,
  gate,
  rootOf,
  stubMethod,
  withView,
  type OpenView,
  tabOf,
  shownTabs,
  openView,
  gitState,
} from '../../../../helpers/harness';
import { viewRepositories } from '../../../../helpers/gitFixtures';
import { commitsSent } from '../../../../helpers/fakePage';
import { removeFolder } from '../../../../helpers/tempFolders';

function savedRoots(view: OpenView): unknown[] {
  const saved = view.store.values.get(tabsKey);
  return Array.isArray(saved) ? saved.map(rootOf) : [];
}

suite('Git tool with two tabs', () => {
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

  test('names tabs of folders with the same name after the folders they are in, and closes one, opening the next', async () => {
    const zeta = await tempRepository(path.join(folder, 'Zeta'));
    await zeta.commit('zeta');
    const twin = await tempRepository(path.join(folder, 'a', 'main'));
    await twin.commit('twin');
    const tabs = [other, zeta.root, repository.root, twin.root];
    await withView(log, tabs, async (own) => {
      const names = () =>
        (shownTabs(own.page)?.tabs ?? []).map((tab) => tab.name);
      assert.deepStrictEqual(
        shownTabs(own.page)?.tabs.map((tab) => tab.folder),
        [undefined, undefined, path.basename(folder), 'a'],
      );
      await own.connection.receive({
        type: 'closeTab',
        tab: tabOf(own.page, twin.root),
      });
      assert.deepStrictEqual(names(), ['other', 'Zeta', 'main']);
      await own.connection.receive({
        type: 'closeTab',
        tab: tabOf(own.page, other),
      });
      const left = shownTabs(own.page);
      assert.deepStrictEqual(names(), ['Zeta', 'main']);
      assert.strictEqual(left?.active, zeta.root);
    });
  });

  test('moves a tab where it is dropped, keeping the open one open, and saves the order', async () => {
    const moved = await tempRepository(path.join(folder, 'Moved'));
    await moved.commit('moved');
    await withView(log, [repository.root, other, moved.root], async (own) => {
      const names = () =>
        (shownTabs(own.page)?.tabs ?? []).map((tab) => tab.name);
      await own.connection.receive({
        type: 'moveTab',
        tab: tabOf(own.page, moved.root),
        index: 0,
      });
      assert.deepStrictEqual(names(), ['Moved', 'main', 'other']);
      assert.strictEqual(shownTabs(own.page)?.active, repository.root);
      assert.deepStrictEqual(savedRoots(own), [
        moved.root,
        repository.root,
        other,
      ]);
      await own.connection.receive({
        type: 'moveTab',
        tab: tabOf(own.page, moved.root),
        index: 2,
      });
      assert.deepStrictEqual(names(), ['main', 'other', 'Moved']);
    });
  });

  test('moves no tab not open, nor to a place not in the row, sending the order as it stands so the page drops the one it showed', async () => {
    await withView(log, [repository.root, other], async (own) => {
      const roots = () => shownTabs(own.page)?.tabs.map((tab) => tab.root);
      for (const [tab, index] of [
        ['nowhere', 0],
        [tabOf(own.page, other), -1],
        [tabOf(own.page, other), 2],
        [tabOf(own.page, other), 0.5],
        [tabOf(own.page, other), Number.NaN],
      ] as const) {
        own.page.clear();
        await own.connection.receive({ type: 'moveTab', tab, index });
        assert.deepStrictEqual(roots(), [repository.root, other]);
      }
      assert.deepStrictEqual(savedRoots(own), [repository.root, other]);
    });
  });

  test('stops reading the history of a tab closed while it reads it, as reading a large one takes seconds', async () => {
    const childProcess = process.getBuiltinModule('node:child_process');
    const { spawn } = childProcess;
    let reading: ReturnType<typeof spawn> | undefined;
    replaceBuiltin(
      childProcess,
      'spawn',
      (command: string, args: readonly string[], options: object) => {
        if (
          args.includes('--parents') &&
          !args.some((arg) => arg.startsWith('--max-count')) &&
          reading === undefined
        ) {
          reading = spawn(
            process.execPath,
            ['-e', 'setTimeout(() => {}, 30000)'],
            options,
          );
          return reading;
        }
        return spawn(command, args, options);
      },
    );
    try {
      await withView(
        log,
        [other, repository.root],
        async (own) => {
          const ready = own.connection.receive({ type: 'ready' });
          await waitFor(() => reading !== undefined, 'the history to be read');
          await own.connection.receive({
            type: 'closeTab',
            tab: tabOf(own.page, other),
          });
          await waitFor(
            () => reading?.exitCode !== null || reading.signalCode !== null,
            'the read to stop',
          );
          await ready;
        },
        false,
      );
    } finally {
      replaceBuiltin(childProcess, 'spawn', spawn);
    }
  });

  test('goes back to the tab shown before when the shown one closes, rather than to the one next to it', async () => {
    const last = await tempRepository(path.join(folder, 'last'));
    await last.commit('last');
    await withView(log, [repository.root, other, last.root], async (own) => {
      await own.connection.receive({
        type: 'selectTab',
        tab: tabOf(own.page, last.root),
      });
      await own.connection.receive({
        type: 'closeTab',
        tab: tabOf(own.page, last.root),
      });
      assert.strictEqual(shownTabs(own.page)?.active, repository.root);
    });
  });

  test('fetches a repository once at a time, also when its tab is closed and opened again while it fetches', async () => {
    let requests = 0;
    let released = false;
    const waiting: (() => void)[] = [];
    const server = createServer((_request, response) => {
      requests += 1;
      const answer = () => {
        response.writeHead(404);
        response.end();
      };
      if (released) {
        answer();
      } else {
        waiting.push(answer);
      }
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const address = server.address();
    assert.ok(typeof address === 'object' && address !== null);
    const slow = await tempRepository(path.join(folder, 'slow-remote'));
    await slow.commit('a');
    await slow.git(
      'remote',
      'add',
      'origin',
      `http://127.0.0.1:${address.port}/x`,
    );
    try {
      await withView(log, [slow.root, other], async (own) => {
        const first = own.connection.receive({
          type: 'fetch',
          root: slow.root,
        });
        await waitFor(() => requests === 1, 'the fetch to reach the remote');
        await own.connection.receive({
          type: 'closeTab',
          tab: tabOf(own.page, slow.root),
        });
        await own.connection.receive({
          type: 'openRepository',
          root: slow.root,
        });
        const second = own.connection.receive({
          type: 'fetch',
          root: slow.root,
        });
        released = true;
        for (const answer of waiting) {
          answer();
        }
        await Promise.all([first, second]);
        assert.strictEqual(requests, 1);
      });
      takeErrorsLogged(
        logged,
        /^Fetching every remote failed$/,
        /^git -c remote\.origin\.prune=true -c remote\.origin\.pruneTags=false fetch --progress --no-auto-maintenance (?:--no-write-fetch-head )?--all --porcelain failed: fatal: repository '.*' not found/,
      );
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  suite('open', () => {
    let tabs: OpenView;

    beforeEach(async () => {
      tabs = await openView(log, [repository.root, other]);
    });

    afterEach(() => tabs.connection.dispose());

    test('keeps the shown tab when another one closes', async () => {
      await tabs.connection.receive({
        type: 'closeTab',
        tab: tabOf(tabs.page, other),
      });
      const left = shownTabs(tabs.page);
      assert.strictEqual(left?.active, repository.root);
      assert.ok(!left.tabs.some((tab) => sameRoot(tab.root, other)));
    });

    test('sends nothing of a tab closed while it loads to the tab opened again for its repository', async () => {
      const held = gate();
      let holding = true;
      stubMethod(tabs.view, 'sendCommits', async (original, ...args) => {
        if (holding) {
          holding = false;
          await held.opened;
        }
        await original(...args);
      });
      try {
        const applying = tabs.connection.receive({
          type: 'setSolo',
          root: repository.root,
          solo: true,
        });
        await waitFor(
          () => tabs.page.last('applyingSolo')?.running === true,
          'the solo button to spin',
        );
        await tabs.connection.receive({
          type: 'closeTab',
          tab: tabOf(tabs.page, repository.root),
        });
        await tabs.connection.receive({
          type: 'openRepository',
          root: repository.root,
        });
        assert.ok(tabs.page.last('commits'));
        tabs.page.clear();
        held.open();
        await applying;
        assert.strictEqual(commitsSent(tabs.page.messages), 0);
      } finally {
        held.open();
        await gitState(tabs.store).update(soloKey, {});
      }
    });
  });
});

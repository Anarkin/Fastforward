import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { replaceBuiltin } from '../../../../../helpers/builtins';
import { plainOf, strings } from '../../../../../../lib/shared/strings';
import {
  activeTabKey,
  JsonFileStore,
  tabsKey,
  windowsKey,
} from '../../../../../../shell/main/storage';
import {
  GitStorage,
  recentKey,
} from '../../../../../../tools/git/main/storage';
import { FakeStore } from '../../../../../helpers/fakeStore';
import { waitFor } from '../../../../../helpers/fixtures';
import {
  installedGit,
  removeFolder,
  tempFolder,
  type TempRepository,
} from '../../../../../helpers/repositories';
import { recordingLog } from '../../../../../helpers/stub';
import { watchesRecursively } from '../../../../../../tools/git/main/cli/watch';
import {
  gitState,
  attach,
  newView,
  saveTabs,
  closeViews,
  failOnErrorsLogged,
  gate,
  idleOnlyOnceOpened,
  openView,
  reopen,
  savedBookmarks,
  settingsForViews,
  stubMethod,
  takeErrorsLogged,
  withNotices,
  type OpenView,
} from '../../../../../helpers/harness';
import {
  viewRepositories,
  type ViewRepositories,
} from '../../../../../helpers/gitFixtures';

suite('Git tool of one repository', () => {
  let folder: string;
  let repository: TempRepository;
  let fixture: ViewRepositories['fixture'];

  const { log, error: logged } = recordingLog();
  failOnErrorsLogged(logged);

  beforeAll(async () => {
    ({ folder, repository, fixture } = await viewRepositories());
  });

  afterAll(async () => {
    await closeViews();
    removeFolder(folder);
  });

  test('shows a tab without waiting for the state to be written', async () => {
    const written = gate();
    const state = new FakeStore();
    await saveTabs(state, [repository.root]);
    state.update = (key, value) => {
      state.values.set(key, value);
      return written.opened;
    };
    const view = newView(log, await installedGit(), settingsForViews(), state);
    const opened = attach(view);
    try {
      const ready = opened.connection.receive({ type: 'ready' });
      await waitFor(
        () => opened.page.last('commits') !== undefined,
        'the history',
      );
      assert.deepStrictEqual(state.get(windowsKey), [
        { id: '1', tabs: ['1'], active: '1' },
      ]);
      assert.deepStrictEqual(gitState(state).get(recentKey), [repository.root]);
      written.open();
      await ready;
    } finally {
      opened.connection.dispose();
    }
  });

  test('keeps the saved tabs when the state could not be read at start but can be by the next change saved', async () => {
    const profile = tempFolder('state');
    const file = path.join(profile, 'state.json');
    fs.mkdirSync(file);
    const store = new JsonFileStore(file);
    const view = newView(log, await installedGit(), settingsForViews(), store);
    const opened = attach(view);
    try {
      await opened.connection.receive({ type: 'ready' });
      fs.rmdirSync(file);
      fs.writeFileSync(
        file,
        JSON.stringify({
          [tabsKey]: [{ id: '1', tool: 'git', root: repository.root }],
          [activeTabKey]: '1',
        }),
      );
      await store.update('windowBounds', { x: 0, y: 0 });
      assert.deepStrictEqual(new JsonFileStore(file).get(tabsKey), [
        { id: '1', tool: 'git', root: repository.root },
      ]);
      assert.strictEqual(new JsonFileStore(file).get(activeTabKey), '1');
    } finally {
      opened.connection.dispose();
      removeFolder(profile);
    }
  });

  test('shows a tab while its watcher starts', async () => {
    const started = gate();
    const opened = await openView(log, [repository.root], {
      ready: false,
      watched: true,
    });
    stubMethod(opened.view, 'watch', async (original, ...args) => {
      await started.opened;
      return original(...args);
    });
    try {
      const ready = opened.connection.receive({ type: 'ready' });
      await waitFor(
        () => opened.page.last('commits') !== undefined,
        'the history',
      );
      started.open();
      await ready;
    } finally {
      opened.connection.dispose();
    }
  });

  test("shows a tab whose folder can't be watched, saying changes made outside the app won't show until it is opened again, which watches it anew", async () => {
    const opened = await openView(log, [repository.root], {
      ready: false,
      watched: true,
    });
    let starts = 0;
    stubMethod(opened.view, 'startWatching', (original, ...args) => {
      starts++;
      return starts > 1
        ? original(...args)
        : Promise.reject(
            Object.assign(
              new Error(
                `EISDIR: illegal operation on a directory, watch '${repository.root}'`,
              ),
              { code: 'EISDIR', syscall: 'watch', path: repository.root },
            ),
          );
    });
    try {
      await withNotices(opened.page, 'error', async (notices) => {
        await opened.connection.receive({ type: 'ready' });
        assert.deepStrictEqual(notices, [
          plainOf(strings.messages.couldNotWatch(repository.root)),
        ]);
      });
      assert.strictEqual(opened.page.last('error'), undefined);
      assert.notStrictEqual(opened.page.last('commits'), undefined);
      takeErrorsLogged(logged, /^Watching .* failed$/, /^EISDIR: /);
    } finally {
      opened.connection.dispose();
    }
    const reloaded = reopen(opened.view);
    try {
      await reloaded.ready;
      assert.strictEqual(starts, 2);
      assert.strictEqual(reloaded.page.last('notice'), undefined);
    } finally {
      reloaded.connection.dispose();
    }
  });

  test('refreshes once its watcher has started when starting took longer than a change waits to be told, as no watcher was there to tell of the changes made meanwhile', async () => {
    const started = gate();
    const opened = await openView(log, [repository.root], {
      ready: false,
      watched: true,
    });
    stubMethod(opened.view, 'startWatching', async (original, ...args) => {
      await started.opened;
      return original(...args);
    });
    const file = path.join(repository.root, 'made-while-watching-starts.txt');
    try {
      const ready = opened.connection.receive({ type: 'ready' });
      await waitFor(
        () => opened.page.last('workingTree') !== undefined,
        'the working tree',
      );
      const before = opened.page.last('workingTree')?.files ?? 0;
      fs.writeFileSync(file, 'new\n');
      await new Promise((resolve) => setTimeout(resolve, 150));
      started.open();
      await ready;
      await waitFor(
        () => opened.page.last('workingTree')?.files === before + 1,
        'the file made while the watcher started',
      );
    } finally {
      opened.connection.dispose();
      fs.rmSync(file, { force: true });
    }
  });

  test("says changes made outside the app won't show once a folder it watches recursively stops being watched", async (context) => {
    if (!watchesRecursively()) {
      context.skip();
    }
    const nodeFs = process.getBuiltinModule('node:fs');
    const { watch } = nodeFs;
    const made: fs.FSWatcher[] = [];
    replaceBuiltin(nodeFs, 'watch', (...args: Parameters<typeof watch>) => {
      const real = watch(...args);
      made.push(real);
      return real;
    });
    let opened: OpenView;
    try {
      opened = await openView(log, [repository.root], { watched: true });
    } finally {
      replaceBuiltin(nodeFs, 'watch', watch);
    }
    try {
      await withNotices(opened.page, 'error', (notices) => {
        made[0].emit(
          'error',
          Object.assign(new Error('EPERM: operation not permitted'), {
            code: 'EPERM',
          }),
        );
        assert.deepStrictEqual(notices, [
          plainOf(strings.messages.couldNotWatch(repository.root)),
        ]);
        return Promise.resolve();
      });
      takeErrorsLogged(logged, /^Watching .* failed$/, /^EPERM: /);
    } finally {
      opened.connection.dispose();
    }
  });

  test('shows a notice posted while the page loads again once the page is back, as one saved settings or a crash reloads it', async () => {
    const failing = gate();
    const opened = await openView(log, [repository.root], {
      ready: false,
      watched: true,
    });
    let starts = 0;
    stubMethod(opened.view, 'startWatching', async () => {
      starts++;
      if (starts > 1) {
        return { dispose: () => Promise.resolve() };
      }
      await failing.opened;
      throw Object.assign(
        new Error(`EPERM: operation not permitted, watch '${repository.root}'`),
        { code: 'EPERM', syscall: 'watch', path: repository.root },
      );
    });
    const ready = opened.connection.receive({ type: 'ready' });
    await waitFor(() => starts === 1, 'the watcher to start');
    opened.connection.dispose();
    failing.open();
    await ready;
    const reloaded = reopen(opened.view);
    try {
      await reloaded.ready;
      assert.deepStrictEqual(
        reloaded.page.messages
          .filter((message) => message.type === 'notice')
          .map((message) => message.message),
        [strings.messages.couldNotWatch(repository.root)],
      );
      takeErrorsLogged(logged, /^Watching .* failed$/, /^EPERM: /);
    } finally {
      reloaded.connection.dispose();
    }
  });

  test('is idle only once the watcher of a closed page has stopped', async () => {
    const held = gate();
    const opened = await openView(log, [repository.root], {
      ready: false,
      watched: true,
    });
    stubMethod(opened.view, 'startWatching', () =>
      Promise.resolve({ dispose: () => held.opened }),
    );
    await opened.connection.receive({ type: 'ready' });
    opened.connection.dispose();
    await idleOnlyOnceOpened(opened.view, held);
  });

  test('is idle only once a watcher started for a page closed meanwhile has stopped', async () => {
    const started = gate();
    const held = gate();
    const opened = await openView(log, [repository.root], {
      ready: false,
      watched: true,
    });
    stubMethod(opened.view, 'startWatching', async () => {
      await started.opened;
      return { dispose: () => held.opened };
    });
    const ready = opened.connection.receive({ type: 'ready' });
    await waitFor(
      () => opened.page.last('commits') !== undefined,
      'the history',
    );
    opened.connection.dispose();
    started.open();
    await ready;
    await idleOnlyOnceOpened(opened.view, held);
  });

  test('applies the settings the page changes though they fail to be written', async () => {
    const rounds: (() => void)[] = [];
    const own = await openView(
      log,
      [repository.root],
      true,
      undefined,
      (run) => {
        rounds.push(run);
        return () => undefined;
      },
    );
    const setIn = own.settings.setIn.bind(own.settings);
    own.settings.setIn = (section, key, value) => {
      void setIn(section, key, value);
      return Promise.reject(new Error('settings not written'));
    };
    try {
      await own.connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: fixture.merge,
      });
      await own.connection.receive({
        type: 'setCollapseMerges',
        collapse: false,
      });
      assert.strictEqual(own.page.last('commits')?.total, 5);
      own.page.clear();
      await own.connection.receive({
        type: 'setIgnoreWhitespace',
        ignore: true,
      });
      assert.strictEqual(own.page.last('diff')?.hash, fixture.merge);
      await own.connection.receive({ type: 'setAutoFetch', on: true });
      await waitFor(() => rounds.length === 1, 'a background round');
      assert.strictEqual(own.page.last('error'), undefined);
      takeErrorsLogged(
        logged,
        /^Saving the state failed$/,
        /^settings not written$/,
      );
    } finally {
      own.connection.dispose();
    }
  });

  test('keeps the layout and bookmarks the page changes though they fail to be written, saying so only in the log', async () => {
    const own = await openView(log, [repository.root]);
    const setIn = own.settings.setIn.bind(own.settings);
    own.settings.setIn = (section, key, value) => {
      void setIn(section, key, value);
      return Promise.reject(new Error('settings not written'));
    };
    own.store.update = (key, value) => {
      own.store.values.set(key, value);
      return Promise.reject(new Error('state not written'));
    };
    try {
      await own.connection.receive({
        type: 'setColumnWidths',
        widths: [300, 400],
      });
      await own.connection.receive({ type: 'setShowAllFiles', show: true });
      await own.connection.receive({
        type: 'setDiffLayout',
        layout: 'sideBySide',
      });
      await own.connection.receive({
        type: 'setBookmarks',
        root: repository.root,
        bookmarks: [],
      });
      assert.strictEqual(own.page.last('error'), undefined);
      const { layout } = new GitStorage(own.settings, gitState(own.store));
      assert.deepStrictEqual(
        [layout.columnWidths, layout.showAllFiles, layout.diffLayout],
        [[300, 400], true, 'sideBySide'],
      );
      assert.deepStrictEqual(savedBookmarks(own.store, repository.root), []);
      takeErrorsLogged(
        logged,
        /^Saving the state failed$/,
        /^settings not written$/,
        /^state not written$/,
      );
    } finally {
      own.connection.dispose();
    }
  });

  test('shows the bookmarks made for a repository opened for the first time though they fail to be written', async () => {
    const own = await openView(log, [repository.root], false);
    own.store.update = (key, value) => {
      own.store.values.set(key, value);
      return Promise.reject(new Error('state not written'));
    };
    try {
      await own.connection.receive({ type: 'ready' });
      assert.deepStrictEqual(own.page.last('bookmarks')?.bookmarks, [
        { kind: 'branch', name: 'main' },
      ]);
      assert.strictEqual(own.page.last('error'), undefined);
      takeErrorsLogged(
        logged,
        /^Saving the state failed$/,
        /^state not written$/,
      );
    } finally {
      own.connection.dispose();
    }
  });
});

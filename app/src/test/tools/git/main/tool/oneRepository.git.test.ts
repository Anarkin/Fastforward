import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  suite,
  test,
} from 'vitest';
import { replaceBuiltin } from '../../../../builtins';
import { comparisonOf } from '../../../../../tools/git/shared/comparisons';
import {
  workingTreeHash,
  type Bookmark,
  type BookmarkRef,
} from '../../../../../tools/git/shared/protocol';
import { strings } from '../../../../../shared/strings';
import {
  activeTabKey,
  JsonFileStore,
  tabsKey,
} from '../../../../../shell/main/storage';
import {
  bookmarksKey,
  GitStorage,
  recentKey,
  soloKey,
} from '../../../../../tools/git/main/storage';
import { runGit } from '../../../../../tools/git/main/cli/run';
import type { GitTool } from '../../../../../tools/git/main/tool';
import { type Connection, gitState } from '../../../../harness';
import { FakeStore } from '../../../../fakeStore';
import { waitFor } from '../../../../fixtures';
import {
  installedGit,
  removeFolder,
  tempFolder,
  type TempRepository,
} from '../../../../repositories';
import { recordingLog } from '../../../../stub';
import {
  attach,
  newView,
  saveTabs,
  closeViews,
  commitsSent,
  failOnErrorsLogged,
  FakePage,
  gate,
  idleOnlyOnceOpened,
  openView,
  reopen,
  savedBookmarks,
  settingsForViews,
  stubMethod,
  takeErrorsLogged,
  viewRepositories,
  withNotices,
  type OpenView,
  type ViewRepositories,
} from '../../../../harness';
import { watchesRecursively } from '../../../../../tools/git/main/cli/watch';

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
      assert.strictEqual(state.get(activeTabKey), '1');
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
    const opened = await openView(log, [repository.root], false);
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
    const opened = await openView(log, [repository.root], false);
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
          strings.messages.couldNotWatch(repository.root),
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
    const opened = await openView(log, [repository.root], false);
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
      opened = await openView(log, [repository.root]);
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
          strings.messages.couldNotWatch(repository.root),
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
    const opened = await openView(log, [repository.root], false);
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
    const opened = await openView(log, [repository.root], false);
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
    const opened = await openView(log, [repository.root], false);
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
      await own.connection.receive({ type: 'setWordWrap', wrap: true });
      await own.connection.receive({
        type: 'setBookmarks',
        root: repository.root,
        bookmarks: [],
      });
      assert.strictEqual(own.page.last('error'), undefined);
      const { layout } = new GitStorage(own.settings, gitState(own.store));
      assert.deepStrictEqual(
        [
          layout.columnWidths,
          layout.showAllFiles,
          layout.diffLayout,
          layout.wordWrap,
        ],
        [[300, 400], true, 'sideBySide', true],
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

  suite('with its tab open', () => {
    let fastforward: GitTool;
    let page: FakePage;
    let connection: Connection;
    let store: FakeStore;

    beforeEach(async () => {
      ({
        view: fastforward,
        page,
        connection,
        store,
      } = await openView(log, [repository.root], 'unwatched'));
    });

    afterEach(() => connection.dispose());

    test('shows the history with merges collapsed', () => {
      const commits = page.last('commits');
      assert.ok(commits);
      assert.strictEqual(commits.total, 3);
      assert.deepStrictEqual(
        commits.commits.map((commit) => commit.subject),
        ['merge feature', 'b', 'a'],
      );
      assert.strictEqual(commits.graph[0]?.merge, 'collapsed');
      assert.strictEqual(commits.graph[0]?.hidden, 2);

      const refs = page.last('repository')?.refs.map((ref) => ref.name);
      assert.deepStrictEqual(refs?.toSorted(), ['feature', 'main']);
    });

    test('starts with no commit selected the first time a tab opens, and opens again with none once the commit is deselected', async () => {
      assert.ok(page.last('commits'));
      assert.strictEqual(page.last('reveal'), undefined);
      assert.strictEqual(page.last('files'), undefined);

      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: fixture.b,
      });
      assert.strictEqual(page.last('files')?.hash, fixture.b);
      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: undefined,
      });
      page.clear();
      await connection.receive({ type: 'ready' });
      assert.strictEqual(page.last('reveal'), undefined);
      assert.strictEqual(page.last('files'), undefined);
      assert.strictEqual(page.last('diff'), undefined);
    });

    test('is idle only once the messages it was handling are handled, also after the page closed', async () => {
      const held = gate();
      let handling = false;
      stubMethod(fastforward, 'handle', async (original, ...args) => {
        handling = true;
        await held.opened;
        return original(...args);
      });
      const handled = connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: fixture.b,
      });
      await waitFor(() => handling, 'the message to be handled');
      connection.dispose();
      await idleOnlyOnceOpened(fastforward, held);
      await handled;
    });

    test('is idle only once the steps back and forward of a commit selected are sent', async () => {
      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: fixture.a,
      });
      const held = gate();
      let sending = false;
      stubMethod(fastforward, 'sendNavigation', async (original, ...args) => {
        sending = true;
        await held.opened;
        return original(...args);
      });
      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: fixture.b,
      });
      assert.ok(sending);
      await idleOnlyOnceOpened(fastforward, held);
    });

    test('reopens at the position of the selected commit', async () => {
      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: fixture.b,
      });
      page.clear();
      await connection.receive({ type: 'ready' });
      const replayed = page.messages.find(
        (message) => message.type === 'commits',
      );
      assert.strictEqual(replayed?.selectedIndex, 1);
    });

    test('shows the last selected commit when an earlier one answers last', async () => {
      const held = gate();
      let waiting = false;
      stubMethod(fastforward, 'patchOf', async (original, ...args) => {
        if (args[1] === workingTreeHash) {
          waiting = true;
          await held.opened;
        }
        return original(...args);
      });
      const first = connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: workingTreeHash,
      });
      await waitFor(() => waiting, 'the working tree diff');
      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: fixture.b,
      });
      held.open();
      await first;
      assert.strictEqual(page.last('files')?.hash, fixture.b);
      assert.strictEqual(page.last('diff')?.hash, fixture.b);
    });

    test('makes the main branch a bookmark the first time, and saves the bookmarks the page sets', async () => {
      const main: BookmarkRef = { kind: 'branch', name: 'main' };
      assert.deepStrictEqual(page.last('bookmarks')?.bookmarks, [main]);

      await connection.receive({
        type: 'setBookmarks',
        root: repository.root,
        bookmarks: [],
      });
      assert.deepStrictEqual(savedBookmarks(store, repository.root), []);
    });

    test('saves no bookmarks the page sets in a shape it does not know, or for a repository not open, and saves those for an open one under its own spelling', async () => {
      const main: BookmarkRef = { kind: 'branch', name: 'main' };
      for (const [root, bookmarks] of [
        [repository.root, 'main'],
        [repository.root, [main, { kind: 'branch', name: 1 }]],
        [path.join(folder, 'elsewhere'), [main]],
        [`${repository.root}${path.sep}.`, [main]],
      ]) {
        await connection.receive(
          JSON.parse(JSON.stringify({ type: 'setBookmarks', root, bookmarks })),
        );
      }
      assert.deepStrictEqual(gitState(store).get(bookmarksKey), {
        [repository.root]: [main],
      });
    });

    test('takes a root the page spells another way as the one of its tab, adding no tab for it', async () => {
      const spelled = `${repository.root}${path.sep}.`;
      await connection.receive({ type: 'setSolo', root: spelled, solo: true });
      try {
        assert.deepStrictEqual(gitState(store).get(soloKey), {
          [repository.root]: true,
        });
        await connection.receive({
          type: 'scrolled',
          root: spelled,
          hash: fixture.b,
          offset: 3,
          report: 1,
        });
        page.clear();
        await connection.receive({
          type: 'setSolo',
          root: repository.root,
          solo: false,
        });
        assert.strictEqual(page.last('commits')?.scrollTarget?.offset, 3);
      } finally {
        await gitState(store).update(soloKey, {});
      }
    });

    test('sends the history again, in place, with the row of a commit bookmarked or no longer bookmarked by hash as one with bubbles or without', async () => {
      const main: BookmarkRef = { kind: 'branch', name: 'main' };
      const setBookmarks = async (bookmarks: readonly Bookmark[]) => {
        page.clear();
        await connection.receive({
          type: 'setBookmarks',
          root: repository.root,
          bookmarks,
        });
        return page.last('commits');
      };
      assert.deepStrictEqual(page.last('commits')?.decorations, [0]);
      await connection.receive({
        type: 'scrolled',
        root: repository.root,
        hash: fixture.b,
        offset: 7,
        report: 1,
      });
      const bookmarked = await setBookmarks([
        main,
        { kind: 'commit', name: fixture.b },
      ]);
      assert.deepStrictEqual(bookmarked?.decorations.toSorted(), [0, 1]);
      assert.deepStrictEqual(bookmarked.scrollTarget, {
        index: 1,
        offset: 7,
        report: 1,
      });
      assert.strictEqual(
        await setBookmarks([
          main,
          { kind: 'commit', name: fixture.b },
          { kind: 'branch', name: 'feature' },
        ]),
        undefined,
      );
      assert.deepStrictEqual((await setBookmarks([main]))?.decorations, [0]);
    });

    test('refreshes once at a time, without sending an unchanged diff', async () => {
      let calls = 0;
      let running = 0;
      let most = 0;
      stubMethod(fastforward, 'refreshOnce', async (original, ...args) => {
        calls++;
        running++;
        most = Math.max(most, running);
        try {
          await original(...args);
        } finally {
          running--;
        }
      });
      fs.writeFileSync(path.join(repository.root, 'draft.txt'), 'draft\n');
      try {
        await connection.receive({
          type: 'selectCommit',
          root: repository.root,
          hash: workingTreeHash,
        });
        assert.ok(page.last('diff')?.patch.includes('+draft'));
        await connection.refresh();
        calls = 0;
        most = 0;
        page.clear();
        await Promise.all([connection.refresh(), connection.refresh()]);
        assert.strictEqual(most, 1);
        assert.ok(calls >= 2);
        assert.ok(page.last('workingTree'));
        assert.strictEqual(page.last('files'), undefined);
        assert.strictEqual(page.last('diff'), undefined);
        assert.strictEqual(page.last('error'), undefined);
      } finally {
        fs.rmSync(path.join(repository.root, 'draft.txt'));
      }
    });

    test('sends a diff asked for again while a refresh finds it unchanged', async () => {
      fs.writeFileSync(path.join(repository.root, 'one.txt'), 'one\n');
      fs.writeFileSync(path.join(repository.root, 'two.txt'), 'two\n');
      try {
        await connection.receive({
          type: 'selectCommit',
          root: repository.root,
          hash: workingTreeHash,
        });
        await connection.receive({
          type: 'selectFile',
          root: repository.root,
          hash: workingTreeHash,
          path: 'one.txt',
        });
        assert.strictEqual(page.last('diff')?.path, 'one.txt');
        const held = gate();
        let waiting = 0;
        stubMethod(fastforward, 'patchOf', async (original, ...args) => {
          if (waiting < 2) {
            waiting++;
            await held.opened;
          }
          return original(...args);
        });
        page.clear();
        const asked = Promise.all([
          connection.receive({
            type: 'selectFile',
            root: repository.root,
            hash: workingTreeHash,
            path: 'two.txt',
          }),
          connection.receive({
            type: 'selectFile',
            root: repository.root,
            hash: workingTreeHash,
            path: 'one.txt',
          }),
        ]);
        await waitFor(() => waiting === 2, 'the asked for diffs');
        await connection.refresh();
        held.open();
        await asked;
        assert.strictEqual(page.last('diff')?.path, 'one.txt');
      } finally {
        fs.rmSync(path.join(repository.root, 'one.txt'));
        fs.rmSync(path.join(repository.root, 'two.txt'));
      }
    });

    test('lists every file of a commit and of the working tree', async () => {
      const file = path.join(repository.root, 'tree-file.txt');
      fs.writeFileSync(file, 'tree\n');
      try {
        await connection.receive({
          type: 'selectCommit',
          root: repository.root,
          hash: workingTreeHash,
        });
        await connection.receive({
          type: 'loadTree',
          root: repository.root,
          hash: workingTreeHash,
        });
        assert.ok(page.last('tree')?.paths.includes('tree-file.txt'));
        await connection.receive({
          type: 'selectCommit',
          root: repository.root,
          hash: fixture.merge,
        });
        await connection.receive({
          type: 'loadTree',
          root: repository.root,
          hash: fixture.merge,
        });
        const tree = page.last('tree');
        assert.strictEqual(tree?.hash, fixture.merge);
        assert.ok(!tree.paths.includes('tree-file.txt'));
      } finally {
        fs.rmSync(file);
      }
    });

    test('lists the untracked files of the working tree once per refresh, for its files and its tree', async () => {
      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: workingTreeHash,
      });
      await connection.receive({
        type: 'loadTree',
        root: repository.root,
        hash: workingTreeHash,
      });
      stubMethod(fastforward, 'sendWorkingTree', async (original, ...args) => {
        const workingTree = await original(...args);
        assert.ok(
          typeof workingTree === 'object' &&
            workingTree !== null &&
            'files' in workingTree &&
            Array.isArray(workingTree.files) &&
            'untracked' in workingTree &&
            Array.isArray(workingTree.untracked),
        );
        return {
          ...workingTree,
          untracked: [...workingTree.untracked, 'listed.txt'],
          files: [
            ...workingTree.files,
            {
              path: 'listed.txt',
              oldPath: undefined,
              status: 'U',
              insertions: 0,
              deletions: 0,
            },
          ],
        };
      });
      await connection.refresh();
      assert.deepStrictEqual(page.last('tree')?.paths, ['listed.txt']);
    });

    test('sends no tree of a commit no longer selected', async () => {
      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: fixture.b,
      });
      page.clear();
      await connection.receive({
        type: 'loadTree',
        root: repository.root,
        hash: fixture.a,
      });
      assert.strictEqual(page.last('tree'), undefined);
      await connection.receive({
        type: 'loadTree',
        root: repository.root,
        hash: fixture.b,
      });
      assert.strictEqual(page.last('tree')?.hash, fixture.b);
    });

    test('loads as many rows of the history as the list asks for', async () => {
      const generation = page.last('commits')?.generation ?? -1;
      await connection.receive({
        type: 'loadCommits',
        root: repository.root,
        generation,
        start: 1,
        count: 1,
      });
      const page2 = page.last('commitPage');
      assert.strictEqual(page2?.start, 1);
      assert.strictEqual(page2.count, 1);
      assert.strictEqual(page2.generation, generation);
      assert.deepStrictEqual(
        page2.commits.map((commit) => commit.subject),
        ['b'],
      );
      assert.strictEqual(page2.graph.length, 1);

      await connection.receive({
        type: 'loadCommits',
        root: repository.root,
        generation: generation - 1,
        start: 1,
        count: 1,
      });
      assert.strictEqual(page.last('commitPage'), page2);
    });

    test('answers a page of the history that fails to load with no commits, so the list asks again', async () => {
      const generation = page.last('commits')?.generation ?? -1;
      const elsewhere = tempFolder('not-a-repository');
      try {
        stubMethod(fastforward, 'context', async (original, ...args) => {
          const context = await original(...args);
          assert.ok(typeof context === 'object' && context !== null);
          return { ...context, root: elsewhere };
        });
        page.clear();
        await connection.receive({
          type: 'loadCommits',
          root: repository.root,
          generation,
          start: 1,
          count: 2,
        });
        const failed = page.last('commitPage');
        assert.strictEqual(failed?.start, 1);
        assert.strictEqual(failed.count, 2);
        assert.strictEqual(failed.generation, generation);
        assert.deepStrictEqual(failed.commits, []);
        assert.ok(page.last('error'));
        takeErrorsLogged(
          logged,
          /^Handling loadCommits from the page failed$/,
          /^git log .* failed: fatal: not a git repository/,
        );
      } finally {
        removeFolder(elsewhere);
      }
    });

    test('lets the keys go on from the merge a collapse hides the selected commit in, leaving it selected', async () => {
      const toggle = () =>
        connection.receive({
          type: 'toggleMerge',
          root: repository.root,
          hash: fixture.merge,
        });
      await toggle();
      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: fixture.f2,
      });
      await toggle();
      const commits = page.last('commits');
      assert.strictEqual(commits?.total, 3);
      assert.strictEqual(commits.selectedIndex, undefined);
      assert.strictEqual(commits.keysFrom, 0);
    });

    test('compares the selected commit a collapse hides with another commit', async () => {
      const toggle = () =>
        connection.receive({
          type: 'toggleMerge',
          root: repository.root,
          hash: fixture.merge,
        });
      await toggle();
      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: fixture.f2,
      });
      await toggle();
      page.clear();
      const hash = comparisonOf(fixture.f2, fixture.b);
      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash,
      });
      assert.strictEqual(page.last('error'), undefined);
      assert.strictEqual(page.last('files')?.hash, hash);
      assert.strictEqual(page.last('diff')?.hash, hash);
      assert.strictEqual(commitsSent(page.messages), 0);
    });

    test('loads the files of a selected commit a collapsed merge hides once the page loads again with settings changed by hand', async () => {
      const toggle = () =>
        connection.receive({
          type: 'toggleMerge',
          root: repository.root,
          hash: fixture.merge,
        });
      await toggle();
      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: fixture.f2,
      });
      await toggle();
      fastforward.reloadSettings();
      page.clear();
      await connection.receive({ type: 'ready' });
      assert.strictEqual(page.last('error'), undefined);
      assert.strictEqual(page.last('files')?.hash, fixture.f2);
    });

    test('forgets merges toggled by hand when the merge setting changes', async () => {
      const toggle = () =>
        connection.receive({
          type: 'toggleMerge',
          root: repository.root,
          hash: fixture.merge,
        });
      await toggle();
      assert.strictEqual(page.last('commits')?.total, 5);
      await toggle();
      assert.strictEqual(page.last('commits')?.total, 3);
      await toggle();
      await connection.receive({ type: 'setCollapseMerges', collapse: false });
      assert.strictEqual(page.last('commits')?.total, 5);
    });

    test('sends only the newest list when the history is worked out twice at once', async () => {
      page.clear();
      await Promise.all([
        connection.receive({
          type: 'toggleMerge',
          root: repository.root,
          hash: fixture.merge,
        }),
        connection.receive({
          type: 'toggleMerge',
          root: repository.root,
          hash: fixture.merge,
        }),
      ]);
      assert.strictEqual(commitsSent(page.messages), 1);
      assert.strictEqual(page.last('commits')?.total, 3);
    });

    test('expands the merge hiding a commit it jumps to', async () => {
      page.clear();
      await connection.receive({
        type: 'jump',
        root: repository.root,
        hash: fixture.f2,
      });
      assert.strictEqual(page.last('commits')?.total, 5);
      assert.strictEqual(page.last('reveal')?.hash, fixture.f2);
      assert.strictEqual(page.last('files')?.hash, fixture.f2);
    });

    test('says so when a commit picked is hidden in a collapsed merge', async () => {
      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: fixture.f2,
      });
      assert.match(page.last('error')?.message ?? '', /not in the history/);
    });

    test('sends the files and diff again when the shown commit is selected again', async () => {
      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: fixture.merge,
      });
      assert.strictEqual(page.last('files')?.hash, fixture.merge);
      page.clear();
      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: fixture.merge,
      });
      assert.strictEqual(page.last('files')?.hash, fixture.merge);
      assert.strictEqual(page.last('diff')?.hash, fixture.merge);
    });

    test('takes only hashes of the history from the page, as it shows repository content, and a hash such as --output=<file> made git write a file', async () => {
      const written = path.join(folder, 'written.txt');
      const hash = `--output=${written}`;
      for (const message of [
        {
          type: 'loadFileDiff',
          root: repository.root,
          hash,
          path: 'a',
          diff: 1,
        },
        { type: 'selectFile', root: repository.root, hash, path: 'a' },
        { type: 'loadTree', root: repository.root, hash },
        { type: 'selectCommit', root: repository.root, hash },
        ...[hash, 'HEAD~1', ':/b', fixture.a.toUpperCase()].map(
          (target) =>
            ({
              type: 'checkout',
              root: repository.root,
              target: { kind: 'commit', hash: target },
            }) as const,
        ),
      ] as const) {
        page.clear();
        await connection.receive(message);
        assert.match(page.last('error')?.message ?? '', /not in the history/);
      }
      await connection.receive({ type: 'setIgnoreWhitespace', ignore: true });
      assert.strictEqual(page.last('diff'), undefined);
      assert.ok(!fs.existsSync(written));
      assert.strictEqual(
        (await repository.git('symbolic-ref', 'HEAD')).trim(),
        'refs/heads/main',
      );
    });

    test('checks out only refs of the repository named by the page, saying a ref it lacks is gone', async () => {
      let switches = 0;
      const childProcess = process.getBuiltinModule('node:child_process');
      const { spawn } = childProcess;
      replaceBuiltin(
        childProcess,
        'spawn',
        (...args: Parameters<typeof spawn>) => {
          if (args[1]?.includes('switch')) {
            switches += 1;
          }
          return spawn(...args);
        },
      );
      try {
        await withNotices(page, 'error', async (messages) => {
          for (const target of [
            { kind: 'branch', name: 'main~1' },
            { kind: 'branch', name: 'no-such-branch' },
            { kind: 'tag', name: 'no-such-tag' },
            { kind: 'remote', name: 'origin/no-such-branch' },
          ] as const) {
            await connection.receive({
              type: 'checkout',
              root: repository.root,
              target,
            });
          }
          assert.deepStrictEqual(messages, [
            "main~1 doesn't exist, so it wasn't checked out",
            "no-such-branch doesn't exist, so it wasn't checked out",
            "no-such-tag doesn't exist, so it wasn't checked out",
            "origin/no-such-branch doesn't exist, so it wasn't checked out",
          ]);
        });
      } finally {
        replaceBuiltin(childProcess, 'spawn', spawn);
      }
      assert.strictEqual(switches, 0);
      assert.strictEqual(
        (await repository.git('symbolic-ref', 'HEAD')).trim(),
        'refs/heads/main',
      );
    });

    test('sends the texts a diff asks for, an uncommitted new side read from disk, each side of a file once however often asked for, and none of a side over 2 MB, from git or from disk', async () => {
      const file = path.join(repository.root, 'texts.ts');
      fs.writeFileSync(file, 'old\n');
      try {
        const [blob] = await repository.resolve(
          (await repository.git('hash-object', '-w', file)).trim(),
        );
        fs.writeFileSync(file, 'new\n');
        await connection.receive({
          type: 'selectCommit',
          root: repository.root,
          hash: workingTreeHash,
        });
        page.clear();
        await connection.receive({
          type: 'loadTexts',
          root: repository.root,
          hash: workingTreeHash,
          diff: 3,
          texts: [
            { path: 'texts.ts', side: 'old', blob },
            { path: 'texts.ts', side: 'new', blob },
            { path: 'other.ts', side: 'old', blob: '0'.repeat(39) + '1' },
          ],
        });
        assert.deepStrictEqual(
          page.last('texts')?.texts.map(({ side, text }) => [side, text]),
          [
            ['old', 'old\n'],
            ['new', 'new\n'],
            ['old', undefined],
          ],
        );
        assert.strictEqual(page.last('texts')?.diff, 3);
        page.clear();
        await connection.receive({
          type: 'loadTexts',
          root: repository.root,
          hash: workingTreeHash,
          diff: 4,
          texts: Array.from({ length: 1000 }, (_, at) => ({
            path: 'texts.ts',
            side: 'new' as const,
            blob: `${at}`,
          })),
        });
        assert.deepStrictEqual(
          page.last('texts')?.texts.map(({ side, text }) => [side, text]),
          [['new', 'new\n']],
        );
        fs.writeFileSync(file, 'x'.repeat(2 * 1024 * 1024 + 1));
        const [large] = await repository.resolve(
          (await repository.git('hash-object', '-w', file)).trim(),
        );
        page.clear();
        await connection.receive({
          type: 'loadTexts',
          root: repository.root,
          hash: workingTreeHash,
          diff: 4,
          texts: [
            { path: 'texts.ts', side: 'old', blob: large },
            { path: 'texts.ts', side: 'new', blob: large },
          ],
        });
        assert.deepStrictEqual(
          page.last('texts')?.texts.map(({ side, text }) => [side, text]),
          [
            ['old', undefined],
            ['new', undefined],
          ],
        );
      } finally {
        fs.rmSync(file, { force: true });
      }
    });

    test('sends the texts of blobs asked for again without reading them from git again', async () => {
      const file = path.join(repository.root, 'kept.ts');
      fs.writeFileSync(file, 'kept\n');
      const childProcess = process.getBuiltinModule('node:child_process');
      const { spawn } = childProcess;
      try {
        const blob = (await repository.git('hash-object', '-w', file)).trim();
        await connection.receive({
          type: 'selectCommit',
          root: repository.root,
          hash: fixture.merge,
        });
        let gits = 0;
        replaceBuiltin(
          childProcess,
          'spawn',
          (...args: Parameters<typeof spawn>) => {
            gits++;
            return spawn(...args);
          },
        );
        for (const diff of [1, 2]) {
          page.clear();
          await connection.receive({
            type: 'loadTexts',
            root: repository.root,
            hash: fixture.merge,
            diff,
            texts: [{ path: 'kept.ts', side: 'new', blob }],
          });
          assert.deepStrictEqual(
            page.last('texts')?.texts.map(({ text }) => text),
            ['kept\n'],
          );
        }
        assert.strictEqual(gits, 1);
      } finally {
        replaceBuiltin(childProcess, 'spawn', spawn);
        fs.rmSync(file, { force: true });
      }
    });

    test('reads from disk only files in the repository, not the git folder nor ignored files, whatever path the page names', async () => {
      const exclude = path.join(repository.root, '.git', 'info', 'exclude');
      const excluded = fs.readFileSync(exclude, 'utf8');
      const secret = path.join(repository.root, 'secret.env');
      fs.appendFileSync(exclude, '\nsecret.env\n');
      fs.writeFileSync(secret, 'API_KEY=hunter2\n');
      const tracked = path.join(repository.root, 'tracked.txt');
      fs.writeFileSync(tracked, 'tracked\n');
      await repository.git('add', 'tracked.txt');
      await connection.refresh();
      try {
        await connection.receive({
          type: 'selectCommit',
          root: repository.root,
          hash: workingTreeHash,
        });
        const read = async (file: string) => {
          page.clear();
          await connection.receive({
            type: 'selectFile',
            root: repository.root,
            hash: workingTreeHash,
            path: file,
            area: 'unstaged',
          });
          const shown = page.last('fileContent')?.content;
          page.clear();
          await connection.receive({
            type: 'loadTexts',
            root: repository.root,
            hash: workingTreeHash,
            diff: 5,
            texts: [{ path: file, side: 'new', blob: '0'.repeat(40) }],
          });
          return [shown, page.last('texts')?.texts[0]?.text];
        };
        assert.deepStrictEqual(await read('.git/config'), ['', undefined]);
        assert.deepStrictEqual(await read('secret.env'), ['', undefined]);
        assert.deepStrictEqual(await read('tracked.txt'), [
          'tracked\n',
          'tracked\n',
        ]);
      } finally {
        fs.writeFileSync(exclude, excluded);
        fs.rmSync(secret, { force: true });
        await repository.git('rm', '-q', '--cached', 'tracked.txt');
        fs.rmSync(tracked, { force: true });
        await connection.refresh();
      }
    });

    test('asks git for no blob the page names other than by its full object id, as git would take any other name as a revision to look up', async () => {
      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: fixture.merge,
      });
      const childProcess = process.getBuiltinModule('node:child_process');
      const { spawn } = childProcess;
      let gits = 0;
      replaceBuiltin(
        childProcess,
        'spawn',
        (...args: Parameters<typeof spawn>) => {
          gits++;
          return spawn(...args);
        },
      );
      try {
        page.clear();
        await connection.receive({
          type: 'loadTexts',
          root: repository.root,
          hash: fixture.merge,
          diff: 6,
          texts: ['HEAD:a.txt', ':/merge', 'HEAD', '-n'].map((blob, at) => ({
            path: `${at}.txt`,
            side: 'new' as const,
            blob,
          })),
        });
      } finally {
        replaceBuiltin(childProcess, 'spawn', spawn);
      }
      assert.strictEqual(gits, 0);
      assert.deepStrictEqual(
        page.last('texts')?.texts.map(({ text }) => text),
        [undefined, undefined, undefined, undefined],
      );
    });

    test('shows what git said when a request fails', async () => {
      stubMethod(fastforward, 'sendTree', () =>
        runGit(repository.gitPath, repository.root, ['ls-tree', 'no-tree']),
      );
      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: fixture.merge,
      });
      await connection.receive({
        type: 'loadTree',
        root: repository.root,
        hash: fixture.merge,
      });
      assert.match(page.last('error')?.message ?? '', /^fatal: .*no-tree$/);
      takeErrorsLogged(
        logged,
        /^Handling loadTree from the page failed$/,
        /^git ls-tree no-tree failed: /,
      );
    });
  });
});

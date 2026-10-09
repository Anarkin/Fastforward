import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { workingTreeHash, type BookmarkRef } from '../shared/protocol';
import { activeTabKey, recentKey, Storage, tabsKey } from '../storage';
import { runGit } from '../git/run';
import { FastforwardView, type Connection } from '../view';
import { FakeStore } from './fakeStore';
import { waitFor } from './fixtures';
import {
  installedGit,
  removeFolder,
  tempFolder,
  type TempRepository,
} from './repositories';
import { recordingLog } from './stub';
import {
  attach,
  closeViews,
  commitsSent,
  failOnErrorsLogged,
  FakeHost,
  FakePage,
  gate,
  idleOnlyOnceOpened,
  openView,
  savedBookmarks,
  stubMethod,
  takeErrorsLogged,
  viewRepositories,
  viewSettings,
  withView,
  type ViewRepositories,
} from './viewHarness';

suite('View of one repository', function () {
  this.timeout(30_000);

  let folder: string;
  let repository: TempRepository;
  let fixture: ViewRepositories['fixture'];

  const { log, error: logged } = recordingLog();
  failOnErrorsLogged(logged);

  suiteSetup(async () => {
    ({ folder, repository, fixture } = await viewRepositories());
  });

  suiteTeardown(async () => {
    await closeViews();
    removeFolder(folder);
  });

  test('shows a tab without waiting for the state to be written', async () => {
    const written = gate();
    const state = new FakeStore();
    await state.update(tabsKey, [repository.root]);
    state.update = (key, value) => {
      state.values.set(key, value);
      return written.opened;
    };
    const view = new FastforwardView(
      log,
      await installedGit(),
      new Storage(viewSettings(), state),
      new FakeHost(),
    );
    const opened = attach(view);
    try {
      const ready = opened.connection.receive({ type: 'ready' });
      await waitFor(
        () => opened.page.last('commits') !== undefined,
        'the history',
      );
      assert.strictEqual(state.get(activeTabKey), repository.root);
      assert.deepStrictEqual(state.get(recentKey), [repository.root]);
      written.open();
      await ready;
    } finally {
      opened.connection.dispose();
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
    const set = own.settings.set.bind(own.settings);
    own.settings.set = (key, value) => {
      void set(key, value);
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

  test('keeps a folder spelled two ways as one tab', async function () {
    if (process.platform !== 'win32') {
      this.skip();
    }
    const respelled = repository.root.replace(/^[a-z]/i, (drive) =>
      drive === drive.toUpperCase() ? drive.toLowerCase() : drive.toUpperCase(),
    );
    await withView(log, [repository.root, respelled], async (view) => {
      const roots = view.page.last('tabs')?.tabs.map((tab) => tab.root) ?? [];
      assert.deepStrictEqual(
        roots.filter((root) => root.toLowerCase() === respelled.toLowerCase()),
        [repository.root],
      );
    });
  });

  suite('with its tab open', () => {
    let fastforward: FastforwardView;
    let page: FakePage;
    let connection: Connection;
    let store: FakeStore;

    setup(async () => {
      ({
        view: fastforward,
        page,
        connection,
        store,
      } = await openView(log, [repository.root], 'unwatched'));
    });

    teardown(() => connection.dispose());

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
          /^loadCommits failed$/,
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

    test('takes only hashes of the history from the page', async () => {
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
      ] as const) {
        page.clear();
        await connection.receive(message);
        assert.match(page.last('error')?.message ?? '', /not in the history/);
      }
      assert.ok(!fs.existsSync(written));
    });

    test('sends the texts a diff asks for, an uncommitted new side read from disk', async () => {
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
            { path: 'texts.ts', side: 'old', blob: '0'.repeat(39) + '1' },
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
        Reflect.set(
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
        Reflect.set(childProcess, 'spawn', spawn);
        fs.rmSync(file, { force: true });
      }
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
        /^loadTree failed$/,
        /^git ls-tree no-tree failed: /,
      );
    });
  });
});

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
import { comparisonOf } from '../../../../../tools/git/shared/comparisons';
import {
  workingTreeHash,
  type Bookmark,
  type BookmarkRef,
} from '../../../../../tools/git/shared/protocol';
import { plainOf } from '../../../../../lib/shared/strings';
import { bookmarksKey, soloKey } from '../../../../../tools/git/main/storage';
import type { GitTool } from '../../../../../tools/git/main/tool';
import { FakeStore } from '../../../../helpers/fakeStore';
import { waitFor } from '../../../../helpers/fixtures';
import {
  removeFolder,
  tempFolder,
  type TempRepository,
} from '../../../../helpers/repositories';
import { recordingLog } from '../../../../helpers/stub';
import {
  type Connection,
  gitState,
  closeViews,
  commitsSent,
  failOnErrorsLogged,
  FakePage,
  gate,
  idleOnlyOnceOpened,
  openView,
  savedBookmarks,
  stubMethod,
  takeErrorsLogged,
} from '../../../../helpers/harness';
import {
  viewRepositories,
  type ViewRepositories,
} from '../../../../helpers/gitFixtures';

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
      } = await openView(log, [repository.root]));
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

    test('saves of the bookmarks the page sets only their kind and name, and none past the most it keeps, as the page is not trusted', async () => {
      const main: BookmarkRef = { kind: 'branch', name: 'main' };
      const set = (bookmarks: unknown) =>
        connection.receive(
          JSON.parse(
            JSON.stringify({
              type: 'setBookmarks',
              root: repository.root,
              bookmarks,
            }),
          ),
        );
      await set([{ ...main, note: 'kept aside' }]);
      assert.deepStrictEqual(savedBookmarks(store, repository.root), [main]);
      await set(
        Array.from({ length: 1001 }, (_, index) => ({
          kind: 'tag',
          name: `v${index}`,
        })),
      );
      await set([{ kind: 'tag', name: 'v'.repeat(5000) }]);
      assert.deepStrictEqual(savedBookmarks(store, repository.root), [main]);
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
      assert.match(
        plainOf(page.last('error')?.message ?? ''),
        /not in the history/,
      );
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
  });
});

import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { getGitApi } from '../git/repository';
import {
  workingTreeHash,
  type ToWebview,
  type BookmarkRef,
} from '../shared/protocol';
import {
  activeTabKey,
  bookmarksKey,
  collapseMergesKey,
  tabsKey,
} from '../storage';
import { FastforwardView, type Connection } from '../view';
import { waitFor } from './fixtures';
import {
  removeFolder,
  settle,
  tempFolder,
  tempRepository,
  type TempRepository,
} from './repositories';
import { withMessageStub } from './stub';

// Storage like the extension's, kept in memory
class FakeMemento implements vscode.Memento {
  readonly values = new Map<string, unknown>();

  keys(): readonly string[] {
    return [...this.values.keys()];
  }

  get<T>(key: string, defaultValue?: T): T {
    // Like the real storage, which isn't typed either
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    return (this.values.has(key) ? this.values.get(key) : defaultValue) as T;
  }

  update(key: string, value: unknown): Promise<void> {
    this.values.set(key, value);
    return Promise.resolve();
  }

  setKeysForSync(): void {}
}

// The view's messages to the page, by type
class FakePage {
  readonly messages: ToWebview[] = [];

  last<T extends ToWebview['type']>(
    type: T,
  ): Extract<ToWebview, { type: T }> | undefined {
    return this.messages.findLast(
      (message): message is Extract<ToWebview, { type: T }> =>
        message.type === type,
    );
  }

  clear(): void {
    this.messages.length = 0;
  }
}

interface OpenView {
  view: FastforwardView;
  page: FakePage;
  connection: Connection;
  globalState: FakeMemento;
}

// A new view with these tabs, the first one open, loaded like the page does
// unless it isn't ready
async function openView(
  log: vscode.LogOutputChannel,
  tabs: readonly string[],
  ready = true,
): Promise<OpenView> {
  const workspaceState = new FakeMemento();
  await workspaceState.update(tabsKey, tabs);
  await workspaceState.update(activeTabKey, tabs[0]);
  const globalState = new FakeMemento();
  const view = new FastforwardView(
    log,
    vscode.Uri.file(__dirname),
    workspaceState,
    globalState,
  );
  const page = new FakePage();
  const connection = view.connect((message) => page.messages.push(message));
  if (ready) {
    await connection.receive({ type: 'ready' });
  }
  return { view, page, connection, globalState };
}

// How many histories the view sent, replayed ones included
function commitsSent(messages: readonly ToWebview[]): number {
  return messages.filter((message) => message.type === 'commits').length;
}

function savedBookmarks(
  globalState: FakeMemento,
): Record<string, BookmarkRef[]> {
  return globalState.get<Record<string, BookmarkRef[]>>(bookmarksKey, {});
}

suite('View', function () {
  this.timeout(30_000);

  // The temp folder every repository of these tests is in
  let folder: string;
  // main: a, b, merge of feature; feature: f1, f2, kept after the merge; the
  // tests that change it put it back as it was
  let repository: TempRepository;
  let fixture: { a: string; b: string; f2: string; merge: string };
  // Another repository with one commit, for a second tab
  let other: string;
  let otherHead: string;

  const log = vscode.window.createOutputChannel('Fastforward view test', {
    log: true,
  });

  suiteSetup(async () => {
    folder = tempFolder('view');
    repository = await tempRepository(path.join(folder, 'main'));
    await repository.commit('a');
    await repository.git('checkout', '-b', 'feature');
    await repository.commit('f1');
    await repository.commit('f2');
    await repository.git('checkout', 'main');
    await repository.commit('b');
    await repository.git('merge', '--no-ff', 'feature', '-m', 'merge feature');
    const [a, b, f2, merge] = await repository.resolve(
      'main~2',
      'main~1',
      'feature',
      'main',
    );
    fixture = { a, b, f2, merge };

    const second = await tempRepository(path.join(folder, 'other'));
    await second.commit('other');
    other = second.root;
    [otherHead] = await second.resolve('HEAD');
  });

  suiteTeardown(() => {
    log.dispose();
    removeFolder(folder);
  });

  // The fixture's main as it was made, checked out, once the Git extension
  // has read it, for the tests after one that changed it
  async function restore(): Promise<void> {
    await repository.git('checkout', '-f', 'main');
    await repository.git('reset', '--hard', fixture.merge);
    await settle(repository.root);
  }

  suite('of one repository', () => {
    let fastforward: FastforwardView;
    let page: FakePage;
    let connection: Connection;
    let globalState: FakeMemento;

    setup(async () => {
      ({
        view: fastforward,
        page,
        connection,
        globalState,
      } = await openView(log, [repository.root]));
    });

    teardown(() => connection.dispose());

    test('shows the history with merges collapsed', () => {
      const commits = page.last('commits');
      assert.ok(commits);
      // merge, b and a; f1 and f2 are in the merge, although feature points
      // at f2, as it is merged
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

    test('starts at the checked-out commit the first time a tab opens', async () => {
      assert.strictEqual(page.last('reveal')?.hash, fixture.merge);
      assert.strictEqual(page.last('files')?.hash, fixture.merge);

      // Opening it again keeps the place, here nothing selected
      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: undefined,
      });
      page.clear();
      await connection.receive({ type: 'ready' });
      assert.strictEqual(page.last('reveal'), undefined);
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

    test('shows the last selected commit when answers come out of order', async () => {
      // The working tree's files take more git than a commit's, so its
      // answer comes last
      await Promise.all([
        connection.receive({
          type: 'selectCommit',
          root: repository.root,
          hash: workingTreeHash,
        }),
        connection.receive({
          type: 'selectCommit',
          root: repository.root,
          hash: fixture.b,
        }),
      ]);
      assert.strictEqual(page.last('files')?.hash, fixture.b);
      assert.strictEqual(page.last('diff')?.hash, fixture.b);
    });

    test('makes the main branch a bookmark once, then keeps the saved bookmarks', async () => {
      const main: BookmarkRef = { kind: 'branch', name: 'main' };
      assert.deepStrictEqual(page.last('bookmarks')?.bookmarks, [main]);

      await connection.receive({
        type: 'setBookmarks',
        root: repository.root,
        bookmarks: [],
      });
      assert.deepStrictEqual(savedBookmarks(globalState)[repository.root], []);
    });

    test('refreshes once at a time, without sending an unchanged diff', async () => {
      fs.writeFileSync(path.join(repository.root, 'draft.txt'), 'draft\n');
      try {
        await connection.receive({
          type: 'selectCommit',
          root: repository.root,
          hash: workingTreeHash,
        });
        assert.ok(page.last('diff')?.patch.includes('+draft'));
        page.clear();
        // Overlapping refreshes of an unchanged working tree
        await Promise.all([connection.refresh(), connection.refresh()]);
        assert.ok(page.last('workingTree'));
        assert.strictEqual(page.last('files'), undefined);
        assert.strictEqual(page.last('diff'), undefined);
        assert.strictEqual(page.last('error'), undefined);
      } finally {
        fs.rmSync(path.join(repository.root, 'draft.txt'));
      }
    });

    test('lists every file of a commit and of the working tree', async () => {
      const file = path.join(repository.root, 'tree-file.txt');
      fs.writeFileSync(file, 'tree\n');
      try {
        await connection.receive({
          type: 'loadTree',
          root: repository.root,
          hash: workingTreeHash,
        });
        assert.ok(page.last('tree')?.paths.includes('tree-file.txt'));
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

    test('loads pages of the history as the list asks for them', async () => {
      const generation = page.last('commits')?.generation ?? -1;
      await connection.receive({
        type: 'loadCommits',
        root: repository.root,
        generation,
        start: 1,
        count: 2,
      });
      const page2 = page.last('commitPage');
      assert.strictEqual(page2?.start, 1);
      assert.strictEqual(page2.generation, generation);
      assert.deepStrictEqual(
        page2.commits.map((commit) => commit.subject),
        ['b', 'a'],
      );
      assert.strictEqual(page2.graph.length, 2);

      // Asked of the history before, which the page replaces with this one
      await connection.receive({
        type: 'loadCommits',
        root: repository.root,
        generation: generation - 1,
        start: 1,
        count: 2,
      });
      assert.strictEqual(page.last('commitPage'), page2);
    });

    test('expands and collapses a merge', async () => {
      await connection.receive({
        type: 'toggleMerge',
        root: repository.root,
        hash: fixture.merge,
      });
      assert.strictEqual(page.last('commits')?.total, 5);
      await connection.receive({
        type: 'toggleMerge',
        root: repository.root,
        hash: fixture.merge,
      });
      assert.strictEqual(page.last('commits')?.total, 3);
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
      // Expanded and collapsed again
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

    test('says so when a commit picked is no longer in the history', async () => {
      // Inside the collapsed merge, as in a list from before it collapsed
      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: fixture.f2,
      });
      assert.match(page.last('error')?.message ?? '', /not in the history/);
    });

    test('reports a jump to a commit outside the history', async () => {
      await connection.receive({
        type: 'jump',
        root: repository.root,
        hash: 'f'.repeat(40),
      });
      assert.match(page.last('error')?.message ?? '', /is not in the history/);
    });

    test('looks up a hash typed in the address bar', async () => {
      const typed = fixture.b.slice(0, 6);
      await connection.receive({
        type: 'lookupHash',
        root: repository.root,
        query: typed,
      });
      assert.deepStrictEqual(page.last('hashLookup'), {
        type: 'hashLookup',
        query: typed,
        result: { kind: 'found', hash: fixture.b, subject: 'b' },
      });
      await connection.receive({
        type: 'lookupHash',
        root: repository.root,
        query: 'ffffff0',
      });
      assert.deepStrictEqual(page.last('hashLookup')?.result, { kind: 'none' });
    });

    test('jumps to a commit by a short hash', async () => {
      await connection.receive({
        type: 'jump',
        root: repository.root,
        hash: fixture.b.slice(0, 7),
      });
      assert.strictEqual(page.last('reveal')?.hash, fixture.b);
      await connection.receive({
        type: 'jump',
        root: repository.root,
        hash: 'abcdef0',
      });
      assert.match(page.last('error')?.message ?? '', /No commit abcdef0/);
    });

    test('goes back and forward through the commits shown', async () => {
      // Opening the tab showed the merge, at HEAD
      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: fixture.b,
      });
      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: fixture.a,
      });
      await waitFor(
        () => page.last('navigation')?.back.length === 2,
        'the history of two steps',
      );
      assert.deepStrictEqual(
        page.last('navigation')?.back.map((entry) => entry.subject),
        ['b', 'merge feature'],
      );

      await connection.receive({
        type: 'navigate',
        root: repository.root,
        direction: 'back',
        steps: 1,
      });
      assert.strictEqual(page.last('reveal')?.hash, fixture.b);
      assert.strictEqual(page.last('files')?.hash, fixture.b);
      assert.deepStrictEqual(
        page.last('navigation')?.forward.map((entry) => entry.hash),
        [fixture.a],
      );

      await connection.receive({
        type: 'navigate',
        root: repository.root,
        direction: 'back',
        steps: 1,
      });
      assert.strictEqual(page.last('reveal')?.hash, fixture.merge);
      await connection.receive({
        type: 'navigate',
        root: repository.root,
        direction: 'forward',
        steps: 2,
      });
      assert.strictEqual(page.last('reveal')?.hash, fixture.a);
      assert.strictEqual(page.last('navigation')?.forward.length, 0);
    });

    test('adds no step for moving through the list with the arrow keys', async () => {
      page.clear();
      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: fixture.b,
        replace: true,
      });
      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: fixture.a,
        replace: true,
      });
      assert.strictEqual(page.last('navigation'), undefined);
      assert.strictEqual(page.last('files')?.hash, fixture.a);
    });

    test('leaves steps to commits that are gone out of the history', async () => {
      const gone = (
        await repository.git(
          'commit-tree',
          'main^{tree}',
          '-p',
          'main',
          '-m',
          'gone',
        )
      ).trim();
      await repository.git('update-ref', 'refs/heads/gone', gone);
      try {
        await connection.refresh();
        // Opening the tab showed the merge, at HEAD
        for (const hash of [gone, fixture.b]) {
          await connection.receive({
            type: 'selectCommit',
            root: repository.root,
            hash,
          });
        }
        await waitFor(
          () => page.last('navigation')?.back.length === 2,
          'the history of two steps',
        );
      } finally {
        await repository.git('update-ref', '-d', 'refs/heads/gone');
      }
      await connection.refresh();
      assert.deepStrictEqual(
        page.last('navigation')?.back.map((entry) => entry.hash),
        [fixture.merge],
      );
      // The first entry of the dropdown is the first step that is still there
      await connection.receive({
        type: 'navigate',
        root: repository.root,
        direction: 'back',
        steps: 1,
      });
      assert.strictEqual(page.last('reveal')?.hash, fixture.merge);
    });

    test('loads the history once when a change comes in while a tab first opens', async () => {
      const own = await openView(log, [repository.root], false);
      try {
        await Promise.all([
          own.connection.receive({ type: 'ready' }),
          own.connection.refresh(),
        ]);
        assert.strictEqual(commitsSent(own.page.messages), 1);
        assert.strictEqual(own.page.last('reveal')?.hash, fixture.merge);
      } finally {
        own.connection.dispose();
      }
    });

    test('refreshes once more for a page that asks while a refresh runs', async () => {
      await settle(repository.root, connection);
      const newer = new FakePage();
      const newerConnection = fastforward.connect((message) =>
        newer.messages.push(message),
      );
      try {
        // The older page asks again after the newer one, as its watcher does
        // when a change comes in then
        await Promise.all([
          connection.refresh(),
          newerConnection.refresh(),
          connection.refresh(),
        ]);
        assert.ok(newer.last('workingTree'));
      } finally {
        newerConnection.dispose();
      }
    });

    test('applies the merge setting to the history shown, without reloading it', async () => {
      await settle(repository.root, connection);
      await connection.receive({ type: 'setCollapseMerges', collapse: false });
      assert.strictEqual(page.last('commits')?.total, 5);
      page.clear();
      await connection.refresh();
      assert.strictEqual(page.last('commits'), undefined, 'reloaded');
    });

    test('saves the layout and sends it when the page loads', async () => {
      await connection.receive({
        type: 'setColumnWidths',
        widths: [400, 250],
      });
      await connection.receive({ type: 'setFilesMode', mode: 'files' });
      await connection.receive({ type: 'setChangesView', view: 'tree' });
      await connection.receive({ type: 'ready' });
      const layout = page.last('layout');
      assert.deepStrictEqual(layout?.columnWidths, [400, 250]);
      assert.strictEqual(layout.filesMode, 'files');
      assert.strictEqual(layout.changesView, 'tree');
    });

    test('keeps a folder spelled two ways as one tab', async function () {
      // Drive letters and paths are case-insensitive only on Windows
      if (process.platform !== 'win32') {
        this.skip();
      }
      const respelled = repository.root.replace(/^[a-z]/i, (drive) =>
        drive === drive.toUpperCase()
          ? drive.toLowerCase()
          : drive.toUpperCase(),
      );
      const view = await openView(log, [repository.root, respelled]);
      try {
        // Among the tabs is the repository open in VS Code, which every view
        // adds
        const roots = view.page.last('tabs')?.tabs.map((tab) => tab.root) ?? [];
        assert.deepStrictEqual(
          roots.filter(
            (root) => root.toLowerCase() === respelled.toLowerCase(),
          ),
          [repository.root],
        );
      } finally {
        view.connection.dispose();
      }
    });

    test('reports a checkout git refuses', async () => {
      await withMessageStub('showErrorMessage', async (messages) => {
        await connection.receive({
          type: 'checkout',
          root: repository.root,
          target: { kind: 'branch', name: 'no-such-branch' },
        });
        assert.strictEqual(messages.length, 1);
        assert.match(messages[0], /couldn't check out no-such-branch/);
      });
    });

    test('reloads when a branch is created', async () => {
      await connection.refresh();
      page.clear();
      await repository.git('branch', 'created', 'main~1');
      try {
        await connection.refresh();
        const refs = page.last('repository')?.refs.map((ref) => ref.name);
        assert.ok(refs?.includes('created'));
      } finally {
        await repository.git('branch', '-D', 'created');
      }
    });

    test('reloads when a ref moves, keeping the top commit in place', async () => {
      // The Git extension may still be catching up with earlier changes
      await settle(repository.root, connection);
      await connection.receive({
        type: 'scrolled',
        root: repository.root,
        hash: fixture.b,
        offset: 7,
      });

      page.clear();
      await connection.refresh();
      assert.strictEqual(page.last('commits'), undefined, 'reloaded unchanged');

      try {
        await repository.commit('c');
        await connection.refresh();
        const commits = page.last('commits');
        assert.strictEqual(commits?.total, 4);
        // b was second, and is third under the new commit
        assert.deepStrictEqual(commits.anchor, { index: 2, offset: 7 });
        assert.ok(page.last('repository'));
      } finally {
        await restore();
      }
    });

    test('stays at the top of the list when new commits come in', async () => {
      await settle(repository.root, connection);
      await connection.receive({
        type: 'scrolled',
        root: repository.root,
        hash: workingTreeHash,
        offset: 0,
      });
      page.clear();
      try {
        await repository.commit('on top');
        await connection.refresh();
        const commits = page.last('commits');
        assert.strictEqual(commits?.commits[0]?.subject, 'on top');
        assert.deepStrictEqual(commits.anchor, { index: -1, offset: 0 });
      } finally {
        await restore();
      }
    });

    test('shows a detached HEAD as a bubble on its commit', async () => {
      await repository.git('checkout', '--detach', fixture.b);
      try {
        // The Git extension notices the checkout before a real change event
        await settle(repository.root);
        page.clear();
        await connection.refresh();
        const info = page.last('repository');
        assert.strictEqual(info?.head, undefined);
        assert.strictEqual(info?.headCommit, fixture.b);
        // b, second in the list, has no refs, so its bubble is HEAD's
        assert.deepStrictEqual(
          page.last('commits')?.decorations.find(([index]) => index === 1),
          [1, 1],
        );
      } finally {
        await restore();
      }
    });

    test('checks out a tag, not a branch of the same name', async () => {
      await repository.git('tag', 'same', fixture.a);
      await repository.git('branch', 'same', 'main');
      try {
        await connection.receive({
          type: 'checkout',
          root: repository.root,
          target: { kind: 'tag', name: 'same' },
        });
        const info = page.last('repository');
        assert.strictEqual(info?.head, undefined);
        assert.strictEqual(info?.headCommit, fixture.a);
      } finally {
        await restore();
        await repository.git('tag', '-d', 'same');
        await repository.git('branch', '-D', 'same');
      }
    });

    test('checks out a branch and a commit', async () => {
      try {
        await connection.receive({
          type: 'checkout',
          root: repository.root,
          target: { kind: 'branch', name: 'feature' },
        });
        assert.strictEqual(page.last('repository')?.head, 'feature');
        // It jumps to what it checked out
        assert.strictEqual(page.last('reveal')?.hash, fixture.f2);

        await connection.receive({
          type: 'checkout',
          root: repository.root,
          target: { kind: 'commit', hash: fixture.a },
        });
        const info = page.last('repository');
        assert.strictEqual(info?.head, undefined);
        assert.strictEqual(info?.headCommit, fixture.a);
      } finally {
        await restore();
      }
    });

    test('checks out a remote branch as a new branch that tracks it', async () => {
      await repository.git('remote', 'add', 'origin', repository.root);
      await repository.git('update-ref', 'refs/remotes/origin/topic', 'main~1');
      try {
        await connection.receive({
          type: 'checkout',
          root: repository.root,
          target: { kind: 'remote', name: 'origin/topic' },
        });
        assert.strictEqual(page.last('repository')?.head, 'topic');
        assert.strictEqual(
          (
            await repository.git(
              'rev-parse',
              '--abbrev-ref',
              'topic@{upstream}',
            )
          ).trim(),
          'origin/topic',
        );
      } finally {
        await restore();
        await repository.git('branch', '-D', 'topic');
        await repository.git('remote', 'remove', 'origin');
      }
    });

    test('fast-forwards the local branch of a remote branch that is ahead', async () => {
      await repository.git('remote', 'add', 'origin', repository.root);
      await repository.git('branch', 'behind', 'main~1');
      await repository.git('update-ref', 'refs/remotes/origin/behind', 'main');
      try {
        await connection.receive({
          type: 'checkout',
          root: repository.root,
          target: { kind: 'remote', name: 'origin/behind' },
        });
        assert.strictEqual(page.last('repository')?.head, 'behind');
        assert.deepStrictEqual(await repository.resolve('behind'), [
          fixture.merge,
        ]);
      } finally {
        await restore();
        await repository.git('branch', '-D', 'behind');
        await repository.git('remote', 'remove', 'origin');
      }
    });

    test('says when a remote branch has diverged from its local one', async () => {
      await repository.git('remote', 'add', 'origin', repository.root);
      await repository.git('checkout', '-b', 'apart', 'main~1');
      try {
        await repository.commit('apart only');
        await repository.git('checkout', 'main');
        await repository.git('update-ref', 'refs/remotes/origin/apart', 'main');
        await settle(repository.root, connection);
        await withMessageStub('showInformationMessage', async (messages) => {
          await connection.receive({
            type: 'checkout',
            root: repository.root,
            target: { kind: 'remote', name: 'origin/apart' },
          });
          // The Git extension may report the new branch a moment later
          await waitFor(
            () => page.last('repository')?.head === 'apart',
            'the checked-out branch',
          );
          assert.strictEqual(messages.length, 1);
          assert.match(
            messages[0],
            /apart, which has diverged from origin\/apart/,
          );
        });
      } finally {
        await restore();
        await repository.git('branch', '-D', 'apart');
        await repository.git('remote', 'remove', 'origin');
      }
    });
  });

  suite('with two tabs', () => {
    let tabs: OpenView;

    // This repository open, and the other one as the second tab
    setup(async () => {
      tabs = await openView(log, [repository.root, other]);
      await settle(repository.root, tabs.connection);
    });

    teardown(() => tabs.connection.dispose());

    test('comes back to a tab as it was, without reloading its history', async () => {
      // Scrolled into the second row, 7 pixels into it
      await tabs.connection.receive({
        type: 'scrolled',
        root: repository.root,
        hash: fixture.b,
        offset: 7,
      });
      await tabs.connection.receive({ type: 'selectTab', root: other });
      await settle(repository.root);
      tabs.page.clear();
      await tabs.connection.receive({
        type: 'selectTab',
        root: repository.root,
      });
      // Only the replayed list, which is scrolled where it was
      assert.strictEqual(commitsSent(tabs.page.messages), 1);
      assert.deepStrictEqual(tabs.page.last('commits')?.anchor, {
        index: 1,
        offset: 7,
      });
      assert.ok(tabs.page.last('workingTree'));
    });

    test('reloads the history of a tab whose refs moved while away', async () => {
      await tabs.connection.receive({ type: 'selectTab', root: other });
      await repository.git('branch', 'moved-away', 'main~1');
      try {
        tabs.page.clear();
        await tabs.connection.receive({
          type: 'selectTab',
          root: repository.root,
        });
        // The replayed list, then the reloaded one
        assert.strictEqual(commitsSent(tabs.page.messages), 2);
        const refs = tabs.page.last('repository')?.refs.map((ref) => ref.name);
        assert.ok(refs?.includes('moved-away'));
      } finally {
        await repository.git('branch', '-D', 'moved-away');
      }
    });

    test('reloads other tabs for a changed merge setting when they come back', async () => {
      await tabs.connection.receive({ type: 'selectTab', root: other });
      await tabs.connection.receive({
        type: 'setCollapseMerges',
        collapse: false,
      });
      assert.strictEqual(tabs.globalState.get(collapseMergesKey), false);
      tabs.page.clear();
      await tabs.connection.receive({
        type: 'selectTab',
        root: repository.root,
      });
      // The feature commits, which the merge hid, are shown now
      assert.strictEqual(tabs.page.last('commits')?.total, 5);
    });

    test('preloads a tab in the background, which then opens as it was left', async () => {
      tabs.page.clear();
      await tabs.connection.receive({ type: 'preloadTab', root: other });
      // Nothing of it shows while another tab is open
      assert.ok(
        !tabs.page.messages.some(
          (message) =>
            (message.type === 'files' && message.hash === otherHead) ||
            (message.type === 'commits' && message.total === 1),
        ),
      );
      tabs.page.clear();
      await tabs.connection.receive({ type: 'selectTab', root: other });
      // Only the preloaded list, at what is checked out
      assert.strictEqual(commitsSent(tabs.page.messages), 1);
      assert.strictEqual(tabs.page.last('files')?.hash, otherHead);
      assert.strictEqual(tabs.page.last('commits')?.total, 1);
    });

    test('preloads nothing for the shown tab, or one opened before', async () => {
      tabs.page.clear();
      await tabs.connection.receive({
        type: 'preloadTab',
        root: repository.root,
      });
      await tabs.connection.receive({ type: 'selectTab', root: other });
      await tabs.connection.receive({
        type: 'selectTab',
        root: repository.root,
      });
      tabs.page.clear();
      await tabs.connection.receive({ type: 'preloadTab', root: other });
      assert.strictEqual(commitsSent(tabs.page.messages), 0);
      assert.strictEqual(tabs.page.last('files'), undefined);
    });

    test('opens a tab that is preloading once it has loaded', async () => {
      tabs.page.clear();
      // Clicked while it still loads
      await Promise.all([
        tabs.connection.receive({ type: 'preloadTab', root: other }),
        tabs.connection.receive({ type: 'selectTab', root: other }),
      ]);
      assert.strictEqual(tabs.page.last('files')?.hash, otherHead);
      assert.strictEqual(tabs.page.last('commits')?.total, 1);
      assert.strictEqual(tabs.page.last('error'), undefined);
      // Once, from the preload, as sending it twice would reset the list's
      // scrolling and the selection
      assert.strictEqual(commitsSent(tabs.page.messages), 1);
    });

    test('shows nothing of a preloading tab once another tab is clicked', async () => {
      tabs.page.clear();
      // Hovered and clicked, and another tab clicked before it loaded
      await Promise.all([
        tabs.connection.receive({ type: 'preloadTab', root: other }),
        tabs.connection.receive({ type: 'selectTab', root: other }),
        tabs.connection.receive({ type: 'selectTab', root: repository.root }),
      ]);
      assert.strictEqual(tabs.page.last('tabs')?.active, repository.root);
      assert.ok(
        !tabs.page.messages.some(
          (message) => message.type === 'commits' && message.total === 1,
        ),
      );
    });

    test('drops what the page asks of a tab it has left, but keeps its bookmarks and place', async () => {
      await tabs.connection.receive({ type: 'selectTab', root: other });
      tabs.page.clear();
      // Sent before the page heard of the switch
      await tabs.connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: fixture.b,
      });
      await tabs.connection.receive({
        type: 'setBookmarks',
        root: repository.root,
        bookmarks: [],
      });
      await tabs.connection.receive({
        type: 'scrolled',
        root: repository.root,
        hash: fixture.b,
        offset: 7,
      });
      assert.strictEqual(tabs.page.last('files'), undefined);
      assert.strictEqual(tabs.page.last('navigation'), undefined);
      const saved = savedBookmarks(tabs.globalState);
      assert.deepStrictEqual(saved[repository.root], []);
      assert.deepStrictEqual(saved[other], [{ kind: 'branch', name: 'main' }]);

      await tabs.connection.receive({
        type: 'selectTab',
        root: repository.root,
      });
      const replayed = tabs.page.messages.find(
        (message) => message.type === 'commits',
      );
      assert.deepStrictEqual(replayed?.anchor, { index: 1, offset: 7 });
      assert.notStrictEqual(tabs.page.last('files')?.hash, fixture.b);
    });

    test('keeps edited bookmarks when a tab opens again', async () => {
      await tabs.connection.receive({
        type: 'setBookmarks',
        root: repository.root,
        bookmarks: [],
      });
      await tabs.connection.receive({ type: 'selectTab', root: other });
      await tabs.connection.receive({
        type: 'selectTab',
        root: repository.root,
      });
      assert.deepStrictEqual(tabs.page.last('bookmarks')?.bookmarks, []);
      await tabs.connection.receive({ type: 'ready' });
      assert.deepStrictEqual(tabs.page.last('bookmarks')?.bookmarks, []);
    });

    test('sorts tabs by name and closes one', async () => {
      await tabs.connection.receive({ type: 'sortTabs' });
      const names = tabs.page.last('tabs')?.tabs.map((tab) => tab.name) ?? [];
      assert.deepStrictEqual(
        names,
        names.toSorted((a, b) =>
          a.localeCompare(b, undefined, { sensitivity: 'base' }),
        ),
      );
      await tabs.connection.receive({ type: 'closeTab', root: other });
      const left = tabs.page.last('tabs');
      const roots = left?.tabs.map((tab) => tab.root.toLowerCase()) ?? [];
      assert.ok(roots.includes(repository.root.toLowerCase()));
      assert.ok(!roots.includes(other.toLowerCase()));
      assert.strictEqual(left?.active, repository.root);
    });
  });

  suite('of other repositories', () => {
    test('saves the merge setting with no tab open', async () => {
      const own = await openView(log, [], false);
      try {
        await own.connection.receive({
          type: 'setCollapseMerges',
          collapse: false,
        });
        assert.strictEqual(own.globalState.get(collapseMergesKey), false);
      } finally {
        own.connection.dispose();
      }
    });

    test('uses a repository cloned inside another, not the outer one', async () => {
      // An outer repository the Git extension has open, as the one of a
      // workspace
      const outer = await tempRepository(path.join(folder, 'outer'));
      await (await getGitApi()).openRepository(vscode.Uri.file(outer.root));
      const nested = await tempRepository(path.join(outer.root, 'nested'), {
        branch: 'inner',
      });
      await nested.commit('inner');
      const [inner] = await nested.resolve('HEAD');
      const view = await openView(log, [nested.root]);
      try {
        const info = view.page.last('repository');
        assert.strictEqual(info?.head, 'inner');
        assert.strictEqual(info?.headCommit, inner);
      } finally {
        view.connection.dispose();
      }
    });

    test('opens a repository without commits', async () => {
      const empty = await tempRepository(path.join(folder, 'empty'));
      fs.writeFileSync(path.join(empty.root, 'new.txt'), 'new\n');
      const view = await openView(log, [empty.root]);
      try {
        assert.strictEqual(view.page.last('error'), undefined);
        assert.strictEqual(view.page.last('commits')?.total, 0);
        assert.strictEqual(view.page.last('workingTree')?.files, 1);
      } finally {
        view.connection.dispose();
      }
    });

    test('says nothing of a tab that fails to preload until it is opened', async () => {
      const plain = path.join(folder, 'plain');
      fs.mkdirSync(plain);
      const view = await openView(log, [repository.root, plain]);
      try {
        view.page.clear();
        await view.connection.receive({ type: 'preloadTab', root: plain });
        assert.strictEqual(view.page.last('error'), undefined);
        await view.connection.receive({ type: 'selectTab', root: plain });
        assert.match(
          view.page.last('error')?.message ?? '',
          /is not a git repository/,
        );
      } finally {
        view.connection.dispose();
      }
    });

    test('leaves large files out of a commit diff until one is asked for', async () => {
      const large = await tempRepository(path.join(folder, 'large'));
      const lines = Array.from({ length: 2000 }, (_, index) => `line ${index}`);
      await large.commit('large', {
        'large.txt': lines.join('\n'),
        'small.txt': 'small\n',
      });
      const [hash] = await large.resolve('HEAD');
      // Opening the tab selects HEAD, the commit
      const view = await openView(log, [large.root]);
      try {
        const patch = view.page.last('diff')?.patch ?? '';
        assert.ok(patch.includes('b/small.txt'), patch);
        assert.ok(!patch.includes('large.txt'), patch);
        await view.connection.receive({
          type: 'loadFileDiff',
          root: large.root,
          hash,
          path: 'large.txt',
        });
        const fileDiff = view.page.last('fileDiff');
        assert.strictEqual(fileDiff?.path, 'large.txt');
        assert.ok(fileDiff?.patch.includes('+line 1999'));
      } finally {
        view.connection.dispose();
      }
    });

    suite('with a file no commit changed since', () => {
      // kept.txt, and changed.txt in the commit after
      let files: TempRepository;
      let kept: string;
      let changed: string;

      suiteSetup(async () => {
        files = await tempRepository(path.join(folder, 'files'));
        await files.commit('kept', { 'kept.txt': 'kept\n' });
        await files.commit('changed', { 'changed.txt': 'changed\n' });
        [kept, changed] = await files.resolve('HEAD~1', 'HEAD');
      });

      test('shows a file the commit did not change whole, until another commit is selected', async () => {
        const view = await openView(log, [files.root]);
        try {
          await view.connection.receive({
            type: 'selectFile',
            root: files.root,
            hash: changed,
            path: 'kept.txt',
          });
          const content = view.page.last('fileContent');
          assert.strictEqual(content?.path, 'kept.txt');
          assert.strictEqual(content.content, 'kept\n');
          assert.strictEqual(content.binary, false);

          // The diff of a commit selected after it is what the view reopens
          // with
          await view.connection.receive({
            type: 'selectCommit',
            root: files.root,
            hash: kept,
          });
          view.page.clear();
          await view.connection.receive({ type: 'ready' });
          const shown = view.page.messages.findLast(
            (message) =>
              message.type === 'diff' || message.type === 'fileContent',
          );
          assert.strictEqual(shown?.type, 'diff');
          assert.strictEqual(shown.hash, kept);
        } finally {
          view.connection.dispose();
        }
      });

      test('sends no unchanged Files tree or whole file on a refresh', async () => {
        const draft = path.join(files.root, 'draft.txt');
        const added = path.join(files.root, 'new.txt');
        fs.writeFileSync(draft, 'draft\n');
        const view = await openView(log, [files.root]);
        try {
          await view.connection.receive({
            type: 'selectCommit',
            root: files.root,
            hash: workingTreeHash,
          });
          await view.connection.receive({
            type: 'loadTree',
            root: files.root,
            hash: workingTreeHash,
          });
          // A file that isn't among the changes is shown whole
          await view.connection.receive({
            type: 'selectFile',
            root: files.root,
            hash: workingTreeHash,
            path: 'kept.txt',
          });
          assert.strictEqual(view.page.last('fileContent')?.content, 'kept\n');
          view.page.clear();
          await view.connection.refresh();
          assert.ok(view.page.last('workingTree'));
          assert.strictEqual(view.page.last('tree'), undefined);
          assert.strictEqual(view.page.last('fileContent'), undefined);

          // A new file changes the tree
          fs.writeFileSync(added, 'new\n');
          await view.connection.refresh();
          assert.ok(view.page.last('tree')?.paths.includes('new.txt'));
        } finally {
          view.connection.dispose();
          fs.rmSync(draft, { force: true });
          fs.rmSync(added, { force: true });
        }
      });
    });
  });
});

suite('Fetch', function () {
  this.timeout(30_000);

  let folder: string;
  // With a bare repository as origin, which main tracks
  let repository: TempRepository;
  let remote: TempRepository;
  let page: FakePage;
  let connection: Connection;

  const log = vscode.window.createOutputChannel('Fastforward fetch test', {
    log: true,
  });

  suiteSetup(async () => {
    folder = tempFolder('fetch');
    repository = await tempRepository(path.join(folder, 'local'));
    await repository.commit('a');
    remote = await tempRepository(path.join(folder, 'remote'), {
      bare: true,
    });
    await repository.git('remote', 'add', 'origin', remote.root);
    await repository.git('push', '-u', 'origin', 'main');
    ({ page, connection } = await openView(log, [repository.root]));
  });

  suiteTeardown(() => {
    connection.dispose();
    log.dispose();
    removeFolder(folder);
  });

  test('updates by itself when a fetch brings new commits', async () => {
    const elsewhere = await tempRepository(path.join(folder, 'elsewhere'));
    await elsewhere.git('pull', remote.root, 'main');
    await elsewhere.commit('from elsewhere');
    await elsewhere.git('push', remote.root, 'main');
    const [fetched] = await elsewhere.resolve('HEAD');
    page.clear();
    try {
      // Like VS Code's autofetch, without asking the view to refresh
      const git = await getGitApi();
      await git.getRepository(vscode.Uri.file(repository.root))?.fetch();
      // The refs and the reloaded history come in side by side
      await waitFor(
        () =>
          page
            .last('repository')
            ?.refs.some(
              (ref) => ref.name === 'origin/main' && ref.commit === fetched,
            ) === true && page.last('commits') !== undefined,
        'the fetched commit and the reloaded history',
      );
    } finally {
      // Back to the same place for the next tests
      await repository.git('merge', '--ff-only', 'origin/main');
      await settle(repository.root, connection);
    }
  });

  test('fetches every remote, dropping branches deleted there', async () => {
    await remote.git('branch', 'short-lived', 'main');
    await connection.receive({ type: 'fetch', root: repository.root });
    await waitFor(
      () =>
        page
          .last('repository')
          ?.refs.some((ref) => ref.name === 'origin/short-lived') === true,
      'the fetched branch',
    );
    await remote.git('branch', '-D', 'short-lived');
    await connection.receive({ type: 'fetch', root: repository.root });
    await waitFor(
      () =>
        page
          .last('repository')
          ?.refs.every((ref) => ref.name !== 'origin/short-lived') === true,
      'the deleted branch to go',
    );
    assert.strictEqual(page.last('fetching')?.running, false);
  });

  test("tells the checked-out branch's upstream", async () => {
    await settle(repository.root, connection);
    const shown = page.last('repository');
    assert.strictEqual(shown?.headUpstream, 'origin/main');
    assert.deepStrictEqual(
      [shown.headCommit],
      await repository.resolve('main'),
    );
  });
});

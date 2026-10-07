import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { workingTreeHash } from '../shared/protocol';
import { soloKey } from '../storage';
import type { Connection, FastforwardView } from '../view';
import type { FakeStore } from './fakeStore';
import { waitFor } from './fixtures';
import { removeFolder, tempFolder, type TempRepository } from './repositories';
import { recordingLog } from './stub';
import {
  attach,
  closeViews,
  commitsSent,
  failOnErrorsLogged,
  type FakePage,
  gate,
  openView,
  reopen,
  restoreRepository,
  stubMethod,
  takeErrorsLogged,
  viewRepositories,
  withView,
  workingTreesSent,
  type ViewRepositories,
} from './viewHarness';

suite('View refreshing one repository', function () {
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

  const restore = () => restoreRepository(repository, fixture.merge);

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

  test('loads the history once when a change comes in while a tab first opens', async () => {
    await withView(
      log,
      [repository.root],
      async (own) => {
        await Promise.all([
          own.connection.receive({ type: 'ready' }),
          own.connection.refresh(),
        ]);
        assert.strictEqual(commitsSent(own.page.messages), 1);
        assert.strictEqual(own.page.last('reveal'), undefined);
      },
      false,
    );
  });

  test('loads the history of a tab first opened during a refresh only after it', async () => {
    await withView(
      log,
      [repository.root],
      async (own) => {
        const held = gate();
        let calls = 0;
        let running = 0;
        let most = 0;
        stubMethod(own.view, 'sendCommits', async (original, ...args) => {
          calls++;
          running++;
          most = Math.max(most, running);
          try {
            if (calls === 1) {
              await held.opened;
            }
            await original(...args);
          } finally {
            running--;
          }
        });
        const refreshing = own.connection.refresh();
        await waitFor(() => calls === 1, 'the refresh to load the history');
        const ready = own.connection.receive({ type: 'ready' });
        await waitFor(
          () => own.page.last('repository') !== undefined,
          'the tab to open',
        );
        held.open();
        await Promise.all([refreshing, ready]);
        assert.strictEqual(most, 1);
        assert.strictEqual(commitsSent(own.page.messages), 1);
        assert.strictEqual(own.page.last('reveal'), undefined);
      },
      false,
    );
  });

  test('refreshes once more for a page that asks while a refresh runs', async () => {
    await connection.refresh();
    let calls = 0;
    stubMethod(fastforward, 'refreshOnce', async (original, ...args) => {
      calls++;
      await original(...args);
    });
    const { page: newer, connection: newerConnection } = attach(fastforward);
    try {
      page.clear();
      await Promise.all([
        connection.refresh(),
        newerConnection.refresh(),
        connection.refresh(),
      ]);
      assert.ok(calls >= 2);
      assert.strictEqual(workingTreesSent(page.messages), 2);
      assert.strictEqual(workingTreesSent(newer.messages), 1);
    } finally {
      newerConnection.dispose();
    }
  });

  test('sends the history to a page opened again while the tab first loads', async () => {
    await withView(
      log,
      [repository.root],
      async (own) => {
        const held = gate();
        stubMethod(own.view, 'sendCommits', async (original, ...args) => {
          await held.opened;
          await original(...args);
        });
        const first = own.connection.receive({ type: 'ready' });
        await waitFor(() => own.page.last('repository') !== undefined, 'refs');
        own.connection.dispose();
        const reopened = reopen(own.view);
        try {
          await waitFor(
            () => reopened.page.last('repository') !== undefined,
            'the replayed refs',
          );
          held.open();
          await Promise.all([first, reopened.ready]);
          assert.strictEqual(reopened.page.last('commits')?.total, 3);
          assert.strictEqual(reopened.page.last('error'), undefined);
        } finally {
          reopened.connection.dispose();
        }
      },
      false,
    );
  });

  test('sends a history reloaded while the page was opened again', async () => {
    await connection.refresh();
    const held = gate();
    stubMethod(fastforward, 'sendCommits', async (original, ...args) => {
      await held.opened;
      await original(...args);
    });
    await repository.git('branch', 'while-closed', fixture.b);
    const reloading = connection.refresh();
    connection.dispose();
    const reopened = reopen(fastforward);
    try {
      await waitFor(
        () => reopened.page.last('commits') !== undefined,
        'the replayed history',
      );
      held.open();
      await Promise.all([reloading, reopened.ready]);
      assert.strictEqual(commitsSent(reopened.page.messages), 2);
    } finally {
      reopened.connection.dispose();
      await repository.git('branch', '-D', 'while-closed');
    }
  });

  test('ends the fetch on a page opened again while it ran', async () => {
    const held = gate();
    stubMethod(fastforward, 'fetchRemotes', () => held.opened);
    {
      const fetching = connection.receive({
        type: 'fetch',
        root: repository.root,
      });
      await waitFor(
        () => page.last('fetching')?.running === true,
        'the fetch to start',
      );
      connection.dispose();
      const reopened = reopen(fastforward);
      try {
        await waitFor(
          () => reopened.page.last('fetching')?.running === true,
          'the replayed fetch',
        );
        held.open();
        await Promise.all([fetching, reopened.ready]);
        assert.strictEqual(reopened.page.last('fetching')?.running, false);
      } finally {
        reopened.connection.dispose();
      }
    }
  });

  test('sends nothing to a page closed while its tab first loads', async () => {
    await withView(
      log,
      [repository.root],
      async (own) => {
        const held = gate();
        stubMethod(own.view, 'sendCommits', async (original, ...args) => {
          await held.opened;
          await original(...args);
        });
        const first = own.connection.receive({ type: 'ready' });
        await waitFor(() => own.page.last('repository') !== undefined, 'refs');
        own.connection.dispose();
        const sent = own.page.messages.length;
        held.open();
        await first;
        assert.strictEqual(own.page.messages.length, sent);
        assert.strictEqual(own.page.last('commits'), undefined);
      },
      false,
    );
  });

  test('runs the refreshes asked for during one that fails', async () => {
    await connection.refresh();
    const held = gate();
    let calls = 0;
    stubMethod(fastforward, 'refreshOnce', async (original, ...args) => {
      calls++;
      if (calls === 1) {
        await held.opened;
        throw new Error('refresh failed');
      }
      await original(...args);
    });
    const { page: newer, connection: newerConnection } = attach(fastforward);
    try {
      const failing = connection.refresh();
      const queued = newerConnection.refresh();
      held.open();
      await Promise.all([failing, queued]);
      assert.ok(newer.last('workingTree'));
      assert.match(page.last('error')?.message ?? '', /refresh failed/);
      takeErrorsLogged(logged, /^refresh failed$/);
    } finally {
      newerConnection.dispose();
    }
  });

  test('takes back the error of a failed refresh once a refresh succeeds', async () => {
    await connection.refresh();
    let failing = true;
    stubMethod(fastforward, 'refreshOnce', async (original, ...args) => {
      if (failing) {
        failing = false;
        throw new Error('refresh failed');
      }
      await original(...args);
    });
    await connection.refresh();
    const failed = page.last('error')?.message;
    assert.match(failed ?? '', /refresh failed/);
    assert.strictEqual(page.last('clearError'), undefined);
    await connection.refresh();
    assert.strictEqual(page.last('clearError')?.message, failed);
    page.clear();
    await connection.refresh();
    assert.strictEqual(page.last('clearError'), undefined);
    takeErrorsLogged(logged, /^refresh failed$/);
  });

  test('refreshes again only once the history is read, though the working tree failed to be', async () => {
    await connection.refresh();
    const held = gate();
    let failing = true;
    let running = 0;
    let most = 0;
    stubMethod(fastforward, 'sendWorkingTree', async (original, ...args) => {
      if (failing) {
        failing = false;
        throw new Error('working tree failed');
      }
      return original(...args);
    });
    stubMethod(fastforward, 'refreshHistory', async (original, ...args) => {
      running++;
      most = Math.max(most, running);
      try {
        await held.opened;
        await original(...args);
      } finally {
        running--;
      }
    });
    const failed = connection.refresh();
    const queued = connection.refresh();
    await waitFor(() => running > 0, 'the history to be read');
    await new Promise((resolve) => setTimeout(resolve, 100));
    held.open();
    await Promise.all([failed, queued]);
    assert.strictEqual(most, 1);
    assert.match(page.last('error')?.message ?? '', /working tree failed/);
    takeErrorsLogged(logged, /^refresh failed$/, /^working tree failed$/);
  });

  test('applies Solo and ends a refresh while refreshes keep being asked for', async () => {
    await connection.refresh();
    let refilling = true;
    const refresh: unknown = Reflect.get(fastforward, 'refresh');
    assert.ok(typeof refresh === 'function');
    stubMethod(fastforward, 'refreshOnce', async (original, ...args) => {
      await original(...args);
      if (refilling) {
        const queued: unknown = Reflect.apply(refresh, fastforward, [args[0]]);
        void Promise.resolve(queued).catch(() => undefined);
      }
    });
    const looping = connection.refresh();
    try {
      page.clear();
      const solo = connection.receive({
        type: 'setSolo',
        root: repository.root,
        solo: true,
      });
      await waitFor(
        () => page.last('applyingSolo')?.running === false,
        'Solo to be applied',
        5000,
      );
      await solo;
      let refreshed = false;
      const refreshing = connection.refresh().then(() => {
        refreshed = true;
      });
      await waitFor(() => refreshed, 'the refresh to end', 5000);
      await refreshing;
    } finally {
      refilling = false;
      await looping;
      await connection.receive({
        type: 'setSolo',
        root: repository.root,
        solo: false,
      });
    }
  });

  test('reads the working tree once at a time while a tab first loads', async () => {
    const own = await openView(log, [repository.root], false);
    const held = gate();
    let calls = 0;
    let running = 0;
    let most = 0;
    let loaded = false;
    stubMethod(own.view, 'sendWorkingTree', async (original, ...args) => {
      calls++;
      running++;
      most = Math.max(most, running);
      try {
        if (calls === 1) {
          await held.opened;
        }
        return await original(...args);
      } finally {
        running--;
      }
    });
    stubMethod(own.view, 'sendCommit', async (original, ...args) => {
      await original(...args);
      loaded = true;
    });
    try {
      const first = own.connection.receive({ type: 'ready' });
      await waitFor(() => calls === 1, 'the working tree to be read');
      const again = own.connection.refresh();
      await waitFor(() => loaded, 'the history to load');
      await Promise.race([
        again,
        new Promise((resolve) => setTimeout(resolve, 500)),
      ]);
      held.open();
      await Promise.all([first, again]);
      assert.strictEqual(most, 1);
      assert.ok(calls >= 2);
    } finally {
      own.connection.dispose();
    }
  });

  test('ignores a file picked on a commit no longer selected', async () => {
    await connection.receive({
      type: 'selectCommit',
      root: repository.root,
      hash: fixture.a,
    });
    await connection.receive({
      type: 'selectCommit',
      root: repository.root,
      hash: workingTreeHash,
    });
    await connection.receive({
      type: 'selectFile',
      root: repository.root,
      hash: fixture.a,
      path: 'a',
    });
    page.clear();
    await connection.refresh();
    assert.strictEqual(page.last('fileContent'), undefined);
    assert.strictEqual(page.last('diff')?.path, undefined);
  });

  test('drops the diff of a file of a commit no longer selected', async () => {
    await repository.commit('changes c', { 'c.txt': 'c\n' });
    const [changed] = await repository.resolve('HEAD');
    try {
      await connection.refresh();
      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: changed,
      });
      const held = gate();
      let calls = 0;
      stubMethod(fastforward, 'patchOf', async (original, ...args) => {
        calls += 1;
        if (calls === 1) {
          await held.opened;
        }
        return original(...args);
      });
      page.clear();
      const loading = connection.receive({
        type: 'loadFileDiff',
        root: repository.root,
        hash: changed,
        path: 'c.txt',
        diff: 1,
      });
      await waitFor(() => calls === 1, 'the file diff');
      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: workingTreeHash,
      });
      held.open();
      await loading;
      assert.strictEqual(page.last('fileDiff'), undefined);
    } finally {
      await restore();
    }
  });

  test('stops reading the files and diff of a commit selected before another', async () => {
    for (const name of ['commitFiles', 'patchOf']) {
      const held = gate();
      const signals: AbortSignal[] = [];
      stubMethod(fastforward, name, async (original, ...args) => {
        const signal = args.at(-1);
        assert.ok(signal instanceof AbortSignal);
        if (args[1] === fixture.a) {
          signals.push(signal);
          await held.opened;
        }
        return original(...args);
      });
      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: workingTreeHash,
      });
      page.clear();
      const first = connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: fixture.a,
      });
      await waitFor(() => signals.length === 1, `the first ${name}`);
      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: fixture.b,
      });
      assert.ok(signals[0]?.aborted, name);
      held.open();
      await first;
      assert.strictEqual(page.last('error'), undefined, name);
      assert.strictEqual(page.last('files')?.hash, fixture.b, name);
      assert.strictEqual(page.last('diff')?.hash, fixture.b, name);
      assert.ok(
        page.messages.every(
          (message) => message.type !== 'diff' || message.hash !== fixture.a,
        ),
        name,
      );
    }
  });

  test('shows a selected uncommitted file deleted since, without failing the refresh', async () => {
    const added = path.join(repository.root, 'added.txt');
    fs.writeFileSync(added, 'added\n');
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
        path: 'added.txt',
      });
      fs.rmSync(added);
      page.clear();
      await connection.refresh();
      assert.strictEqual(page.last('error'), undefined);
      assert.strictEqual(page.last('fileContent')?.content, '');
    } finally {
      fs.rmSync(added, { force: true });
    }
  });

  test('applies the merge setting to the history shown, without reloading it', async () => {
    await connection.refresh();
    let listed = 0;
    stubMethod(fastforward, 'sendCommits', async (original, ...args) => {
      listed++;
      await original(...args);
    });
    await connection.receive({ type: 'setCollapseMerges', collapse: false });
    assert.strictEqual(page.last('commits')?.total, 5);
    assert.strictEqual(listed, 0);
    page.clear();
    await connection.refresh();
    assert.strictEqual(page.last('commits'), undefined, 'reloaded');
  });

  test('shows only the history of the checked-out commit when solo, and every branch again after', async () => {
    await connection.refresh();
    const [tree] = await repository.resolve('HEAD^{tree}');
    const side = (
      await repository.git('commit-tree', tree, '-p', fixture.a, '-m', 'side')
    ).trim();
    await repository.git('branch', 'side', side);
    try {
      await connection.refresh();
      assert.strictEqual(page.last('commits')?.total, 4);
      page.clear();
      await connection.receive({
        type: 'setSolo',
        root: repository.root,
        solo: true,
      });
      assert.strictEqual(page.last('commits')?.total, 3);
      const applying = page.messages.flatMap((message) =>
        message.type === 'applyingSolo' ? [message.running] : [],
      );
      assert.deepStrictEqual(applying, [true, false]);
      assert.ok(
        page.messages.findIndex((message) => message.type === 'commits') <
          page.messages.findLastIndex(
            (message) => message.type === 'applyingSolo',
          ),
      );
      assert.deepStrictEqual(store.get(soloKey), { [repository.root]: true });
      await connection.receive({
        type: 'setSolo',
        root: repository.root,
        solo: false,
      });
      assert.strictEqual(page.last('commits')?.total, 4);
    } finally {
      await store.update(soloKey, {});
      await repository.git('branch', '-D', 'side');
    }
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

  test('lists the history again only for refs that change its commits, whatever solo leaves out', async () => {
    await connection.refresh();
    let listed = 0;
    stubMethod(fastforward, 'sendCommits', async (original, ...args) => {
      listed++;
      await original(...args);
    });
    const refreshed = async (...changes: (readonly string[])[]) => {
      page.clear();
      for (const change of changes) {
        await repository.git(...change);
      }
      await connection.refresh();
      return page.last('commits');
    };
    const [tree] = await repository.resolve('HEAD^{tree}');
    const side = (
      await repository.git('commit-tree', tree, '-p', fixture.a, '-m', 'side')
    ).trim();
    try {
      const tagged = await refreshed(['tag', 'kept', fixture.a]);
      assert.ok(
        page.last('repository')?.refs.some((ref) => ref.name === 'kept'),
      );
      assert.ok(tagged?.decorations.includes(2));
      const detached = await refreshed(['checkout', '--detach', fixture.f2]);
      assert.strictEqual(detached?.total, 5);
      assert.deepStrictEqual(
        detached.commits.map((commit) => commit.subject),
        ['merge feature', 'b', 'f2', 'f1', 'a'],
      );
      assert.strictEqual(
        (await refreshed(['checkout', 'main'], ['tag', '-d', 'kept']))?.total,
        3,
      );
      assert.strictEqual(listed, 0);
      assert.strictEqual((await refreshed(['branch', 'side', side]))?.total, 4);
      assert.strictEqual(listed, 1);
      assert.strictEqual((await refreshed(['branch', '-D', 'side']))?.total, 3);
      assert.strictEqual(listed, 2);
      await connection.receive({
        type: 'setSolo',
        root: repository.root,
        solo: true,
      });
      listed = 0;
      assert.strictEqual(
        (await refreshed(['update-ref', 'refs/remotes/origin/side', side]))
          ?.total,
        3,
      );
      assert.strictEqual(listed, 0);
    } finally {
      await store.update(soloKey, {});
      await repository.git('update-ref', '-d', 'refs/remotes/origin/side');
      await restore();
    }
  });

  test('sends the history again on the next refresh after it failed to load', async () => {
    await connection.refresh();
    const before = page.last('commits')?.generation ?? -1;
    let failed = false;
    const elsewhere = tempFolder('not-a-repository');
    stubMethod(fastforward, 'sendShownHistory', (original, ...args) => {
      const [context, ...rest] = args;
      if (failed || typeof context !== 'object') {
        return original(...args);
      }
      failed = true;
      return original({ ...context, root: elsewhere }, ...rest);
    });
    await repository.git('branch', 'failed-once', 'main~1');
    try {
      await connection.refresh();
      assert.ok(failed);
      await connection.refresh();
      assert.ok((page.last('commits')?.generation ?? -1) > before);
      takeErrorsLogged(
        logged,
        /^refresh failed$/,
        /^git log .* failed: fatal: not a git repository/,
      );
    } finally {
      await repository.git('branch', '-D', 'failed-once');
      removeFolder(elsewhere);
    }
  });

  test('reloads when a ref moves, keeping the top commit in place', async () => {
    await connection.refresh();
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
      assert.deepStrictEqual(commits.scrollTarget, { index: 2, offset: 7 });
      assert.ok(page.last('repository'));
    } finally {
      await restore();
    }
  });

  test('stays at the top of the list when new commits come in', async () => {
    await connection.refresh();
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
      assert.deepStrictEqual(commits.scrollTarget, { index: -1, offset: 0 });
    } finally {
      await restore();
    }
  });

  test('lets go of the selected commit once it is gone from the history', async () => {
    await repository.commit('doomed', { 'doomed.txt': 'doomed\n' });
    const [doomed] = await repository.resolve('HEAD');
    try {
      await connection.refresh();
      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: doomed,
        selection: 7,
      });
      assert.strictEqual(page.last('files')?.hash, doomed);
      page.clear();
      await repository.git('reset', '--hard', 'HEAD~1');
      await connection.refresh();
      assert.strictEqual(page.last('unselect')?.selection, 7);
      page.clear();
      await connection.receive({ type: 'ready' });
      assert.strictEqual(page.last('files'), undefined);
      assert.strictEqual(page.last('commits')?.selectedIndex, undefined);
    } finally {
      await restore();
    }
  });
});

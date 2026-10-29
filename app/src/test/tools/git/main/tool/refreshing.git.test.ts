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
import { workingTreeHash } from '../../../../../tools/git/shared/protocol';
import { strings } from '../../../../../shared/strings';
import { soloKey } from '../../../../../tools/git/main/storage';
import type { GitTool } from '../../../../../tools/git/main/tool';
import type { Connection } from '../../../../harness';
import type { FakeStore } from '../../../../fakeStore';
import { waitFor } from '../../../../fixtures';
import {
  commitAtTime,
  removeFolder,
  tempFolder,
  tempRepository,
  type TempRepository,
} from '../../../../repositories';
import { recordingLog } from '../../../../stub';
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
  gitState,
} from '../../../../harness';

async function letARefreshThatSkippedTheQueueStart(): Promise<void> {
  for (let turn = 0; turn < 3; turn++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

suite('Git tool refreshing one repository', () => {
  let folder: string;
  let repository: TempRepository;
  let fixture: ViewRepositories['fixture'];

  const { log, info, error: logged } = recordingLog();
  failOnErrorsLogged(logged);

  beforeAll(async () => {
    ({ folder, repository, fixture } = await viewRepositories());
  });

  afterAll(async () => {
    await closeViews();
    removeFolder(folder);
  });

  const restore = () => restoreRepository(repository, fixture.merge);

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
    let queued = false;
    stubMethod(own.view, 'queueRefresh', (original, ...args) => {
      queued ||= args[1] === undefined;
      return original(...args);
    });
    try {
      const first = own.connection.receive({ type: 'ready' });
      await waitFor(() => calls === 1, 'the working tree to be read');
      const again = own.connection.refresh();
      await waitFor(() => loaded, 'the history to load');
      await waitFor(() => queued, 'the refresh to be queued');
      await letARefreshThatSkippedTheQueueStart();
      held.open();
      await Promise.all([first, again]);
      assert.strictEqual(most, 1);
      assert.ok(calls >= 2);
    } finally {
      own.connection.dispose();
    }
  });

  test('reads the history whole once a shallow clone is deepened, as the commits it ended at gain their parents', async () => {
    const shallow = await tempRepository(path.join(folder, 'shallow'));
    for (const message of ['c0', 'c1', 'c2']) {
      await shallow.commit(message);
    }
    const [c1, c2] = await shallow.resolve('HEAD~1', 'HEAD');
    const boundary = path.join(shallow.root, '.git', 'shallow');
    fs.writeFileSync(boundary, `${c2}\n`);
    await withView(
      log,
      [shallow.root],
      async ({ page, connection }) => {
        assert.strictEqual(page.last('commits')?.total, 1);
        fs.writeFileSync(boundary, `${c1}\n`);
        await connection.refresh();
        assert.strictEqual(page.last('commits')?.total, 2);
        fs.rmSync(boundary);
        await shallow.commit('c3');
        await connection.refresh();
        assert.strictEqual(page.last('commits')?.total, 4);
      },
      'unwatched',
    );
  });

  test('reads the history whole for a checkout of a tip made in the same second as the one left, as git takes the one checked out first', async () => {
    const tied = await tempRepository(path.join(folder, 'tied'));
    await tied.commit('x');
    const [x] = await tied.resolve('HEAD');
    const time = Number((await tied.git('log', '-1', '--format=%ct')).trim());
    await tied.git(
      'update-ref',
      'refs/heads/main',
      await commitAtTime(tied, x, time + 1, 'a'),
    );
    await tied.git('branch', 'aaa', await commitAtTime(tied, x, time + 1, 'c'));
    await withView(
      log,
      [tied.root],
      async ({ page, connection }) => {
        const subjects = () =>
          page.last('commits')?.commits.map((commit) => commit.subject);
        assert.deepStrictEqual(subjects(), ['a', 'c', 'x']);
        await tied.git('checkout', '-q', 'aaa');
        await connection.refresh();
        assert.deepStrictEqual(subjects(), ['c', 'a', 'x']);
      },
      'unwatched',
    );
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

    test('refreshes once more for a page that asks while a refresh runs', async () => {
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

    test('sends a history reloaded while the page was opened again', async () => {
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

    test('sends a refresh asked for by both the page and the one it was loaded again from once', async () => {
      const held = gate();
      let calls = 0;
      stubMethod(fastforward, 'refreshOnce', async (original, ...args) => {
        calls++;
        if (calls === 1) {
          await held.opened;
        }
        await original(...args);
      });
      let queued = 0;
      stubMethod(fastforward, 'queueRefresh', (original, ...args) => {
        queued += args[1] === undefined ? 1 : 0;
        return original(...args);
      });
      const running = connection.refresh();
      const asked = connection.refresh();
      connection.dispose();
      const reopened = reopen(fastforward);
      try {
        await waitFor(() => queued === 3, 'the reloaded page to ask');
        reopened.page.clear();
        held.open();
        await Promise.all([running, asked, reopened.ready]);
        assert.strictEqual(calls, 2);
        assert.strictEqual(workingTreesSent(reopened.page.messages), 2);
      } finally {
        reopened.connection.dispose();
      }
    });

    test('ends the fetch on a page opened again while it ran', async () => {
      const held = gate();
      stubMethod(fastforward, 'fetchRemotes', async () => {
        await held.opened;
        return { failed: false, changed: false };
      });
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

    test('runs the refreshes asked for during one that fails', async () => {
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
        takeErrorsLogged(
          logged,
          /^Refreshing the tab failed$/,
          /^refresh failed$/,
        );
      } finally {
        newerConnection.dispose();
      }
    });

    test('takes back the error of a failed refresh once a refresh succeeds', async () => {
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
      takeErrorsLogged(
        logged,
        /^Refreshing the tab failed$/,
        /^refresh failed$/,
      );
    });

    test('refreshes again only once the history is read, though the working tree failed to be', async () => {
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
      await letARefreshThatSkippedTheQueueStart();
      held.open();
      await Promise.all([failed, queued]);
      assert.strictEqual(most, 1);
      assert.match(page.last('error')?.message ?? '', /working tree failed/);
      takeErrorsLogged(
        logged,
        /^Refreshing the tab failed$/,
        /^working tree failed$/,
      );
    });

    test('applies Solo and ends a refresh while refreshes keep being asked for', async () => {
      let refilling = true;
      let started = 0;
      let waiting: { from: number; most: number } | undefined;
      const heldBack = Promise.withResolvers<void>();
      const refresh: unknown = Reflect.get(fastforward, 'refresh');
      assert.ok(typeof refresh === 'function');
      stubMethod(fastforward, 'refreshOnce', async (original, ...args) => {
        started++;
        if (waiting && started - waiting.from > waiting.most) {
          refilling = false;
          heldBack.resolve();
        }
        await original(...args);
        if (refilling) {
          const queued: unknown = Reflect.apply(refresh, fastforward, [
            args[0],
          ]);
          void Promise.resolve(queued).catch(() => undefined);
        }
      });
      stubMethod(fastforward, 'queueRefresh', (original, ...args) => {
        const [context, load, ...rest] = args;
        if (typeof load !== 'function') {
          return original(...args);
        }
        waiting = { from: started, most: 0 };
        return original(
          context,
          () => {
            waiting = undefined;
            return Reflect.apply(load, undefined, []);
          },
          ...rest,
        );
      });
      const looping = connection.refresh();
      try {
        page.clear();
        const solo = connection.receive({
          type: 'setSolo',
          root: repository.root,
          solo: true,
        });
        await Promise.race([solo, heldBack.promise]);
        assert.ok(refilling, 'Solo waited for refreshes asked for after it');
        await solo;
        assert.strictEqual(page.last('applyingSolo')?.running, false);

        waiting = { from: started, most: 2 };
        await Promise.race([connection.refresh(), heldBack.promise]);
        assert.ok(
          refilling,
          'a refresh waited for refreshes asked for after it',
        );
        waiting = undefined;
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
      for (const name of ['commitFiles', 'budgetedPatch']) {
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

    test('lists the untracked files once per refresh while a commit is compared with the working tree, showing one made since', async () => {
      const childProcess = process.getBuiltinModule('node:child_process');
      const { spawn } = childProcess;
      let listings = 0;
      const made = path.join(repository.root, 'made.txt');
      try {
        await connection.receive({
          type: 'selectCommit',
          root: repository.root,
          hash: comparisonOf(fixture.a, workingTreeHash),
        });
        fs.writeFileSync(made, 'made\n');
        replaceBuiltin(
          childProcess,
          'spawn',
          (...args: Parameters<typeof spawn>) => {
            const [, gitArgs] = args;
            if (
              gitArgs.includes('--untracked-files=all') ||
              gitArgs.includes('--others')
            ) {
              listings++;
            }
            return spawn(...args);
          },
        );
        page.clear();
        await connection.refresh();
        assert.strictEqual(listings, 1);
        assert.ok(
          page.last('files')?.files.some((file) => file.path === 'made.txt'),
        );
      } finally {
        replaceBuiltin(childProcess, 'spawn', spawn);
        fs.rmSync(made, { force: true });
      }
    });

    test('reads neither the sizes of the uncommitted changes nor the untracked files while a commit is selected, as only their count is shown', async () => {
      const childProcess = process.getBuiltinModule('node:child_process');
      const { spawn } = childProcess;
      const fileSystem = process.getBuiltinModule('node:fs');
      const { createReadStream } = fileSystem;
      const read: string[] = [];
      const untracked = path.join(repository.root, 'untracked.txt');
      await repository.commit('sized', { 'sized.txt': 'one\n' });
      try {
        await connection.refresh();
        await connection.receive({
          type: 'selectCommit',
          root: repository.root,
          hash: fixture.b,
        });
        fs.writeFileSync(path.join(repository.root, 'sized.txt'), 'two\n');
        fs.writeFileSync(untracked, 'new\n');
        replaceBuiltin(
          childProcess,
          'spawn',
          (...args: Parameters<typeof spawn>) => {
            const [, gitArgs] = args;
            if (gitArgs.includes('cat-file')) {
              read.push(gitArgs.join(' '));
            }
            return spawn(...args);
          },
        );
        replaceBuiltin(
          fileSystem,
          'createReadStream',
          (...args: Parameters<typeof createReadStream>) => {
            read.push(String(args[0]));
            return createReadStream(...args);
          },
        );
        page.clear();
        await connection.refresh();
        assert.strictEqual(page.last('workingTree')?.files, 2);
        assert.deepStrictEqual(read, []);
      } finally {
        replaceBuiltin(childProcess, 'spawn', spawn);
        replaceBuiltin(fileSystem, 'createReadStream', createReadStream);
        fs.rmSync(untracked, { force: true });
        await restore();
      }
    });

    test('lists the index again for the tree of the working tree only once the git folder changed, as a change to the files alone leaves it as it was', async () => {
      const childProcess = process.getBuiltinModule('node:child_process');
      const { spawn } = childProcess;
      let listings = 0;
      let change = { refs: false, workingTree: true };
      const staged = path.join(repository.root, 'staged.txt');
      const made = path.join(repository.root, 'made.txt');
      fs.writeFileSync(staged, 'staged\n');
      await repository.git('add', 'staged.txt');
      fs.rmSync(staged);
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
        await connection.refresh();
        stubMethod(fastforward, 'refreshOnce', (original, context) =>
          original(context, change),
        );
        replaceBuiltin(
          childProcess,
          'spawn',
          (...args: Parameters<typeof spawn>) => {
            const [, gitArgs] = args;
            if (gitArgs.includes('ls-files') && gitArgs.includes('--cached')) {
              listings++;
            }
            return spawn(...args);
          },
        );
        fs.writeFileSync(made, 'made\n');
        await connection.refresh();
        assert.strictEqual(listings, 0);
        assert.deepStrictEqual(page.last('tree')?.paths.toSorted(), [
          'made.txt',
          'staged.txt',
        ]);
        await repository.git('rm', '-q', '--cached', 'staged.txt');
        change = { refs: true, workingTree: true };
        await connection.refresh();
        assert.strictEqual(listings, 1);
        assert.deepStrictEqual(page.last('tree')?.paths, ['made.txt']);
      } finally {
        replaceBuiltin(childProcess, 'spawn', spawn);
        fs.rmSync(made, { force: true });
        await restore();
      }
    });

    test('lists the index again for the tree of the working tree once its tab loads afresh, as the index may have changed while nothing watched it', async () => {
      const gone = path.join(repository.root, 'gone.txt');
      const made = path.join(repository.root, 'made.txt');
      const showTree = async () => {
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
      };
      fs.writeFileSync(gone, 'gone\n');
      await repository.git('add', 'gone.txt');
      try {
        await showTree();
        await connection.refresh();
        fastforward.reloadSettings();
        await repository.git('rm', '-q', '-f', 'gone.txt');
        await connection.receive({ type: 'ready' });
        await showTree();
        stubMethod(fastforward, 'refreshOnce', (original, context) =>
          original(context, { refs: false, workingTree: true }),
        );
        fs.writeFileSync(made, 'made\n');
        await connection.refresh();
        assert.deepStrictEqual(page.last('tree')?.paths, ['made.txt']);
      } finally {
        fs.rmSync(made, { force: true });
        await restore();
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

    test('stops reading the history for Solo once it is toggled again, showing only the history asked for last, as the first was read whole and laid out first', async () => {
      const held = gate();
      const signals: AbortSignal[] = [];
      stubMethod(fastforward, 'listFullHistory', async (original, ...args) => {
        const signal = args.find((arg) => arg instanceof AbortSignal);
        assert.ok(signal instanceof AbortSignal);
        signals.push(signal);
        if (signals.length === 1) {
          await Promise.race([
            held.opened,
            new Promise((resolve) => signal.addEventListener('abort', resolve)),
          ]);
        }
        return original(...args);
      });
      page.clear();
      try {
        const on = connection.receive({
          type: 'setSolo',
          root: repository.root,
          solo: true,
        });
        await waitFor(() => signals.length === 1, 'the history to be read');
        const off = connection.receive({
          type: 'setSolo',
          root: repository.root,
          solo: false,
        });
        await new Promise((resolve) => setTimeout(resolve, 50));
        held.open();
        await Promise.all([on, off]);
        assert.strictEqual(signals[0].aborted, true);
        assert.strictEqual(commitsSent(page.messages), 1);
      } finally {
        await gitState(store).update(soloKey, {});
      }
    });

    test('shows only the history of the checked-out commit when solo, and every branch again after', async () => {
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
        assert.deepStrictEqual(gitState(store).get(soloKey), {
          [repository.root]: true,
        });
        await connection.receive({
          type: 'setSolo',
          root: repository.root,
          solo: false,
        });
        assert.strictEqual(page.last('commits')?.total, 4);
      } finally {
        await gitState(store).update(soloKey, {});
        await repository.git('branch', '-D', 'side');
      }
    });

    test('lists the history again only for refs that change its commits other than by adding some, whatever solo leaves out', async () => {
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
        assert.strictEqual(
          (await refreshed(['branch', 'side', side]))?.total,
          4,
        );
        assert.ok(
          page.last('repository')?.refs.some((ref) => ref.name === 'side'),
        );
        assert.strictEqual(listed, 0);
        assert.strictEqual(
          (await refreshed(['branch', '-D', 'side']))?.total,
          3,
        );
        assert.strictEqual(listed, 1);
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
        await gitState(store).update(soloKey, {});
        await repository.git('update-ref', '-d', 'refs/heads/side');
        await repository.git('update-ref', '-d', 'refs/remotes/origin/side');
        await restore();
      }
    });

    test('reads the history whole once a commit read as a stash, without the commits of its index and untracked files, is a stash no more but stays, kept by a branch or built on', async () => {
      await connection.receive({ type: 'setCollapseMerges', collapse: false });
      const before = page.last('commits')?.total ?? 0;
      const untracked = path.join(repository.root, 'untracked.txt');
      const branches = ['kept-stash', 'built-on-stash'];
      try {
        for (const [index, branch] of branches.entries()) {
          fs.writeFileSync(untracked, `${branch}\n`);
          await repository.git('stash', 'push', '-q', '-u');
          await connection.refresh();
          const [stash] = await repository.resolve('stash@{0}');
          await repository.git('branch', branch, stash);
          await repository.git('stash', 'drop', '-q');
          if (index > 0) {
            const built = (
              await repository.git(
                'commit-tree',
                `${stash}^{tree}`,
                '-p',
                stash,
                '-m',
                'on the stash',
              )
            ).trim();
            await repository.git('branch', '-f', branch, built);
          }
          page.clear();
          await connection.refresh();
          assert.strictEqual(
            page.last('commits')?.total,
            before + 3 * (index + 1) + index,
            branch,
          );
        }
      } finally {
        for (const branch of branches) {
          await repository.git('branch', '-D', branch).catch(() => '');
        }
        fs.rmSync(untracked, { force: true });
        await restore();
      }
    });

    test('sends the history again on the next refresh after it failed to load', async () => {
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
          /^Refreshing the tab failed$/,
          /^git log .* failed: fatal: not a git repository/,
        );
      } finally {
        await repository.git('branch', '-D', 'failed-once');
        removeFolder(elsewhere);
      }
    });

    test('sends the history again for rows asked of the layout it failed to replace', async () => {
      const generation = page.last('commits')?.generation;
      assert.ok(generation !== undefined);
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
      try {
        await connection.receive({
          type: 'toggleMerge',
          root: repository.root,
          hash: fixture.merge,
        });
        assert.ok(failed);
        page.clear();
        await connection.receive({
          type: 'loadCommits',
          root: repository.root,
          generation,
          start: 0,
          count: 100,
        });
        const shown = page.last('commits');
        assert.ok(shown && shown.generation > generation);
        assert.strictEqual(shown.total, 5);
        takeErrorsLogged(
          logged,
          /^Handling toggleMerge from the page failed$/,
          /^git log .* failed: fatal: not a git repository/,
        );
      } finally {
        removeFolder(elsewhere);
      }
    });

    test('keeps the top commit in place when a ref moves', async () => {
      await connection.receive({
        type: 'scrolled',
        root: repository.root,
        hash: fixture.b,
        offset: 7,
        report: 1,
      });

      page.clear();
      await connection.refresh();
      assert.strictEqual(page.last('commits'), undefined, 'reloaded unchanged');

      try {
        await repository.commit('c');
        await connection.refresh();
        const commits = page.last('commits');
        assert.strictEqual(commits?.total, 4);
        assert.deepStrictEqual(commits.scrollTarget, {
          index: 2,
          offset: 7,
          report: 1,
        });
        assert.ok(page.last('repository'));
      } finally {
        await restore();
      }
    });

    test('adds the commits refs bring to the history without listing it whole, and lists it once a commit is gone', async () => {
      let listed = 0;
      stubMethod(fastforward, 'sendCommits', async (original, ...args) => {
        listed++;
        await original(...args);
      });
      try {
        page.clear();
        await repository.commit('c');
        await connection.refresh();
        const added = page.last('commits');
        assert.strictEqual(added?.total, 4);
        assert.strictEqual(added.commits[0]?.subject, 'c');
        assert.strictEqual(listed, 0);
        assert.ok(info.includes(strings.log.refsExtended(1)));
        page.clear();
        await repository.git('reset', '-q', '--hard', 'HEAD~1');
        await connection.refresh();
        const gone = page.last('commits');
        assert.strictEqual(gone?.total, 3);
        assert.notStrictEqual(gone.commits[0]?.subject, 'c');
        assert.strictEqual(listed, 1);
      } finally {
        await restore();
      }
    });

    test('stays at the top of the list when new commits come in', async () => {
      await connection.receive({
        type: 'scrolled',
        root: repository.root,
        hash: workingTreeHash,
        offset: 0,
        report: 1,
      });
      page.clear();
      try {
        await repository.commit('on top');
        await connection.refresh();
        const commits = page.last('commits');
        assert.strictEqual(commits?.commits[0]?.subject, 'on top');
        assert.deepStrictEqual(commits.scrollTarget, {
          index: -1,
          offset: 0,
          report: 1,
        });
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
});

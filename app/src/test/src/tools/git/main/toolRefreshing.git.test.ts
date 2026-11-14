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
import { plainOf } from '../../../../../lib/shared/strings';
import type { GitTool } from '../../../../../tools/git/main/tool';
import { waitFor } from '../../../../helpers/fixtures';
import {
  commitAtTime,
  removeFolder,
  tempRepository,
  type TempRepository,
} from '../../../../helpers/repositories';
import { recordingLog } from '../../../../helpers/stub';
import {
  type Connection,
  attach,
  closeViews,
  commitsSent,
  failOnErrorsLogged,
  type FakePage,
  gate,
  openView,
  reopen,
  stubMethod,
  takeErrorsLogged,
  withView,
  workingTreesSent,
} from '../../../../helpers/harness';
import {
  viewRepositories,
  type ViewRepositories,
} from '../../../../helpers/gitFixtures';

async function letARefreshThatSkippedTheQueueStart(): Promise<void> {
  for (let turn = 0; turn < 3; turn++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

suite('Git tool refreshing one repository', () => {
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
    await withView(log, [shallow.root], async ({ page, connection }) => {
      assert.strictEqual(page.last('commits')?.total, 1);
      fs.writeFileSync(boundary, `${c1}\n`);
      await connection.refresh();
      assert.strictEqual(page.last('commits')?.total, 2);
      fs.rmSync(boundary);
      await shallow.commit('c3');
      await connection.refresh();
      assert.strictEqual(page.last('commits')?.total, 4);
    });
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
    await withView(log, [tied.root], async ({ page, connection }) => {
      const subjects = () =>
        page.last('commits')?.commits.map((commit) => commit.subject);
      assert.deepStrictEqual(subjects(), ['a', 'c', 'x']);
      await tied.git('checkout', '-q', 'aaa');
      await connection.refresh();
      assert.deepStrictEqual(subjects(), ['c', 'a', 'x']);
    });
  });

  suite('with its tab open', () => {
    let fastforward: GitTool;
    let page: FakePage;
    let connection: Connection;

    beforeEach(async () => {
      ({
        view: fastforward,
        page,
        connection,
      } = await openView(log, [repository.root]));
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
        assert.match(
          plainOf(page.last('error')?.message ?? ''),
          /refresh failed/,
        );
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
      assert.match(plainOf(failed ?? ''), /refresh failed/);
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
      assert.match(
        plainOf(page.last('error')?.message ?? ''),
        /working tree failed/,
      );
      takeErrorsLogged(
        logged,
        /^Refreshing the tab failed$/,
        /^working tree failed$/,
      );
    });
  });
});

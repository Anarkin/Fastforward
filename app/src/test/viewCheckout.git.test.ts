import * as assert from 'node:assert';
import * as path from 'node:path';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  suite,
  test,
} from 'vitest';
import type { Connection, FastforwardView } from '../view';
import { waitFor } from './fixtures';
import { removeFolder, type TempRepository } from './repositories';
import { recordingLog } from './stub';
import {
  closeViews,
  failOnErrorsLogged,
  type FakePage,
  gate,
  openView,
  restoreRepository,
  stubMethod,
  takeErrorsLogged,
  viewRepositories,
  withNotices,
  type ViewRepositories,
} from './viewHarness';

suite('View checking out', () => {
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

  const restore = () => restoreRepository(repository, fixture.merge);

  let fastforward: FastforwardView;
  let page: FakePage;
  let connection: Connection;

  beforeEach(async () => {
    ({
      view: fastforward,
      page,
      connection,
    } = await openView(log, [repository.root], 'unwatched'));
  });

  afterEach(() => connection.dispose());

  test('shows a detached HEAD as a bubble on its commit', async () => {
    page.clear();
    await repository.git('checkout', '--detach', fixture.b);
    try {
      await connection.refresh();
      const info = page.last('repository');
      assert.strictEqual(info?.head, undefined);
      assert.strictEqual(info?.headCommit, fixture.b);
      assert.ok(page.last('commits')?.decorations.includes(1));
    } finally {
      await restore();
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

  test('checks out a tag, and a remote branch as a new branch tracking it', async () => {
    await repository.git('tag', 'checked', fixture.b);
    await repository.git('remote', 'add', 'origin', repository.root);
    await repository.git('update-ref', 'refs/remotes/origin/topic', fixture.a);
    try {
      await connection.refresh();
      await connection.receive({
        type: 'checkout',
        root: repository.root,
        target: { kind: 'tag', name: 'checked' },
      });
      assert.strictEqual(page.last('repository')?.headCommit, fixture.b);

      await connection.receive({
        type: 'checkout',
        root: repository.root,
        target: { kind: 'remote', name: 'origin/topic' },
      });
      assert.strictEqual(page.last('repository')?.head, 'topic');
      assert.strictEqual(page.last('repository')?.headCommit, fixture.a);
    } finally {
      await restore();
      await repository.git('branch', '-D', 'topic').catch(() => '');
      await repository.git('remote', 'remove', 'origin');
      await repository.git('tag', '-d', 'checked');
    }
  });

  test('checks out a branch asked for while the history is first read, revealing its commit once the history is read', async () => {
    const held = gate();
    const opened = await openView(log, [repository.root], false);
    let reading = false;
    stubMethod(opened.view, 'watch', () => Promise.resolve());
    stubMethod(opened.view, 'listFullHistory', async (original, ...args) => {
      reading = true;
      await held.opened;
      return original(...args);
    });
    try {
      const ready = opened.connection.receive({ type: 'ready' });
      await waitFor(() => reading, 'the history to be read');
      const checkingOut = opened.connection.receive({
        type: 'checkout',
        root: repository.root,
        target: { kind: 'branch', name: 'feature' },
      });
      await waitFor(
        async () =>
          (await repository.git('symbolic-ref', '--short', 'HEAD')).trim() ===
          'feature',
        'the branch to be checked out',
      );
      held.open();
      await Promise.all([ready, checkingOut]);
      assert.strictEqual(opened.page.last('repository')?.head, 'feature');
      assert.strictEqual(opened.page.last('reveal')?.hash, fixture.f2);
    } finally {
      held.open();
      opened.connection.dispose();
      await restore();
    }
  });

  test('checks out one target at a time, in the order asked for', async () => {
    const held = gate();
    let asked = 0;
    let started = 0;
    const steps: string[] = [];
    stubMethod(fastforward, 'checkout', (original, ...args) => {
      asked++;
      return original(...args);
    });
    stubMethod(fastforward, 'checkoutNow', async (original, ...args) => {
      const checkout = ++started;
      steps.push(`start ${checkout}`);
      if (checkout === 1) {
        await held.opened;
      }
      await original(...args);
      steps.push(`end ${checkout}`);
    });
    try {
      const first = connection.receive({
        type: 'checkout',
        root: repository.root,
        target: { kind: 'branch', name: 'feature' },
      });
      await waitFor(() => started === 1, 'the first checkout');
      const second = connection.receive({
        type: 'checkout',
        root: repository.root,
        target: { kind: 'commit', hash: fixture.a },
      });
      await waitFor(() => asked === 2, 'the second checkout to be asked for');
      held.open();
      await Promise.all([first, second]);
      assert.deepStrictEqual(steps, ['start 1', 'end 1', 'start 2', 'end 2']);
      const info = page.last('repository');
      assert.strictEqual(info?.head, undefined);
      assert.strictEqual(info?.headCommit, fixture.a);
    } finally {
      held.open();
      await restore();
    }
  });

  test('keeps a commit picked while a checkout was running rather than revealing the new HEAD', async () => {
    const held = gate();
    let reached = false;
    stubMethod(fastforward, 'showHead', async (original, ...args) => {
      reached = true;
      await held.opened;
      return original(...args);
    });
    try {
      const checkingOut = connection.receive({
        type: 'checkout',
        root: repository.root,
        target: { kind: 'branch', name: 'feature' },
      });
      await waitFor(() => reached, 'the checkout to finish in git');
      page.clear();
      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: fixture.a,
        selection: 7,
      });
      held.open();
      await checkingOut;
      assert.strictEqual(page.last('reveal'), undefined);
      assert.strictEqual(page.last('files')?.hash, fixture.a);
    } finally {
      held.open();
      await restore();
    }
  });

  test('reports what git said when it refuses a checkout, logging the command too', async () => {
    const elsewhere = path.join(folder, 'elsewhere');
    await repository.git('worktree', 'add', elsewhere, 'feature');
    try {
      await withNotices(page, 'error', async (messages) => {
        await connection.receive({
          type: 'checkout',
          root: repository.root,
          target: { kind: 'branch', name: 'feature' },
        });
        assert.strictEqual(messages.length, 1);
        assert.match(
          messages[0],
          /^Couldn't check out feature\. fatal: 'feature' is already used by worktree at /,
        );
      });
    } finally {
      await repository.git('worktree', 'remove', '--force', elsewhere);
    }
    assert.ok(
      logged.some(
        (entry) =>
          entry instanceof Error &&
          /^git .*switch .*feature failed: /.test(entry.message),
      ),
    );
    takeErrorsLogged(
      logged,
      /^Checking out branch feature failed$/,
      /^git .*switch .*feature failed: /,
    );
  });

  test('says which commits a checkout leaves behind on no branch or tag', async () => {
    await repository.git('checkout', '--detach', fixture.a);
    await repository.commit('stray one');
    await repository.commit('stray two');
    const [two, one] = await repository.resolve('HEAD', 'HEAD~1');
    try {
      await withNotices(page, 'info', async (messages) => {
        await connection.receive({
          type: 'checkout',
          root: repository.root,
          target: { kind: 'branch', name: 'main' },
        });
        assert.deepStrictEqual(messages, [
          `Left 2 commits behind on no branch or tag: ${two.slice(0, 7)} ${one.slice(0, 7)}`,
        ]);
      });
    } finally {
      await restore();
    }
  });
});

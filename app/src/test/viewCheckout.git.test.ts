import * as assert from 'node:assert';
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

suite('View checking out', function () {
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

  setup(async () => {
    ({
      view: fastforward,
      page,
      connection,
    } = await openView(log, [repository.root], 'unwatched'));
  });

  teardown(() => connection.dispose());

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
    await withNotices(page, 'error', async (messages) => {
      await connection.receive({
        type: 'checkout',
        root: repository.root,
        target: { kind: 'branch', name: 'no-such-branch' },
      });
      assert.strictEqual(messages.length, 1);
      assert.match(
        messages[0],
        /^Couldn't check out no-such-branch\. fatal: invalid reference: no-such-branch$/,
      );
    });
    assert.ok(
      logged.some(
        (entry) =>
          entry instanceof Error &&
          /^git .*switch .*no-such-branch failed: /.test(entry.message),
      ),
    );
    takeErrorsLogged(
      logged,
      /^Checking out branch no-such-branch failed$/,
      /^git .*switch .*no-such-branch failed: /,
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

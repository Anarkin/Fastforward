import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
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
          await repository.git('rev-parse', '--abbrev-ref', 'topic@{upstream}')
        ).trim(),
        'origin/topic',
      );
    } finally {
      await restore();
      await repository.git('branch', '-D', 'topic');
      await repository.git('remote', 'remove', 'origin');
    }
  });

  test('checks out a remote branch of a remote with a slash in its name as a branch of the same name', async () => {
    await repository.git('remote', 'add', 'team/fork', repository.root);
    await repository.git(
      'update-ref',
      'refs/remotes/team/fork/forked',
      'main~1',
    );
    try {
      await connection.receive({
        type: 'checkout',
        root: repository.root,
        target: { kind: 'remote', name: 'team/fork/forked' },
      });
      assert.strictEqual(page.last('repository')?.head, 'forked');
    } finally {
      await restore();
      await repository.git('branch', '-D', 'forked').catch(() => '');
      await repository.git('remote', 'remove', 'team/fork');
    }
  });

  test('checks out a remote branch as a new branch, even with a tag of its name', async () => {
    await repository.git('remote', 'add', 'origin', repository.root);
    await repository.git('update-ref', 'refs/remotes/origin/clash', 'main~1');
    await repository.git('tag', 'origin/clash', fixture.a);
    try {
      await connection.receive({
        type: 'checkout',
        root: repository.root,
        target: { kind: 'remote', name: 'origin/clash' },
      });
      assert.strictEqual(page.last('repository')?.head, 'clash');
      assert.deepStrictEqual(await repository.resolve('clash'), [fixture.b]);
    } finally {
      await restore();
      await repository.git('branch', '-D', 'clash').catch(() => '');
      await repository.git('tag', '-d', 'origin/clash');
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

  test('fast-forwards no branch but the one it checked out when HEAD moves on meanwhile', async () => {
    await repository.git('remote', 'add', 'origin', repository.root);
    await repository.git('branch', 'behind', 'main~1');
    await repository.git('branch', 'aside', 'main~1');
    await repository.git('update-ref', 'refs/remotes/origin/behind', 'main');
    const hooks = path.join(folder, 'hooks');
    fs.mkdirSync(hooks, { recursive: true });
    fs.writeFileSync(
      path.join(hooks, 'post-checkout'),
      '#!/bin/sh\ngit symbolic-ref HEAD refs/heads/aside\n',
      { mode: 0o755 },
    );
    await repository.git('config', 'core.hooksPath', hooks);
    try {
      await connection.receive({
        type: 'checkout',
        root: repository.root,
        target: { kind: 'remote', name: 'origin/behind' },
      });
      assert.strictEqual(
        (await repository.git('symbolic-ref', 'HEAD')).trim(),
        'refs/heads/aside',
      );
      assert.deepStrictEqual(await repository.resolve('aside', 'behind'), [
        fixture.b,
        fixture.b,
      ]);
    } finally {
      await repository.git('config', '--unset', 'core.hooksPath');
      await restore();
      await repository.git('branch', '-D', 'behind', 'aside');
      await repository.git('update-ref', '-d', 'refs/remotes/origin/behind');
      await repository.git('remote', 'remove', 'origin');
    }
  });

  test("says when it can't fast-forward the local branch of a remote branch", async () => {
    await repository.git('remote', 'add', 'origin', repository.root);
    await repository.git('checkout', '-b', 'blocked', 'main~1');
    const clash = path.join(repository.root, 'clash');
    try {
      await repository.commit('adds clash', { clash: 'theirs' });
      await repository.git('update-ref', 'refs/remotes/origin/blocked', 'HEAD');
      await repository.git('reset', '--hard', 'main~1');
      await repository.git('checkout', 'main');
      fs.writeFileSync(clash, 'mine');
      await connection.refresh();
      await withNotices(page, 'error', async (messages) => {
        await connection.receive({
          type: 'checkout',
          root: repository.root,
          target: { kind: 'remote', name: 'origin/blocked' },
        });
        await waitFor(
          () => page.last('repository')?.head === 'blocked',
          'the checked-out branch',
        );
        assert.strictEqual(messages.length, 1);
        assert.match(
          messages[0],
          /couldn't fast-forward it to origin\/blocked/,
        );
      });
      assert.deepStrictEqual(
        await repository.resolve('blocked'),
        await repository.resolve('main~1'),
      );
      takeErrorsLogged(
        logged,
        /^Fast-forwarding blocked to origin\/blocked failed$/,
        /^git merge --ff-only refs\/remotes\/origin\/blocked failed: /,
      );
    } finally {
      fs.rmSync(clash, { force: true });
      await restore();
      await repository.git('branch', '-D', 'blocked');
      await repository.git('update-ref', '-d', 'refs/remotes/origin/blocked');
      await repository.git('remote', 'remove', 'origin');
    }
  });

  test('says nothing when the local branch of a remote branch is up to date', async () => {
    await repository.git('remote', 'add', 'origin', repository.root);
    await repository.git('branch', 'even', 'main');
    await repository.git('update-ref', 'refs/remotes/origin/even', 'main');
    try {
      await withNotices(page, 'error', async (errors) => {
        await withNotices(page, 'info', async (infos) => {
          await connection.receive({
            type: 'checkout',
            root: repository.root,
            target: { kind: 'remote', name: 'origin/even' },
          });
          await waitFor(
            () => page.last('repository')?.head === 'even',
            'the checked-out branch',
          );
          assert.deepStrictEqual([...errors, ...infos], []);
        });
      });
    } finally {
      await restore();
      await repository.git('branch', '-D', 'even');
      await repository.git('update-ref', '-d', 'refs/remotes/origin/even');
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
      await connection.refresh();
      await withNotices(page, 'info', async (messages) => {
        await connection.receive({
          type: 'checkout',
          root: repository.root,
          target: { kind: 'remote', name: 'origin/apart' },
        });
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

  test('says which commits a checkout leaves behind on no branch or tag, and nothing when none', async () => {
    await repository.git('checkout', '--detach', fixture.a);
    await repository.commit('stray one');
    await repository.commit('stray two');
    const [two, one] = await repository.resolve('HEAD', 'HEAD~1');
    try {
      await connection.refresh();
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
      await withNotices(page, 'info', async (messages) => {
        await connection.receive({
          type: 'checkout',
          root: repository.root,
          target: { kind: 'commit', hash: fixture.b },
        });
        await connection.receive({
          type: 'checkout',
          root: repository.root,
          target: { kind: 'branch', name: 'main' },
        });
        assert.deepStrictEqual(messages, []);
      });
    } finally {
      await restore();
    }
  });

  test('names only the newest few commits a checkout leaves behind', async () => {
    await repository.git('checkout', '--detach', fixture.a);
    for (const stray of ['1', '2', '3', '4', '5', '6']) {
      await repository.commit(stray);
    }
    const newest = await repository.resolve(
      'HEAD',
      'HEAD~1',
      'HEAD~2',
      'HEAD~3',
      'HEAD~4',
    );
    try {
      await connection.refresh();
      await withNotices(page, 'info', async (messages) => {
        await connection.receive({
          type: 'checkout',
          root: repository.root,
          target: { kind: 'branch', name: 'main' },
        });
        assert.deepStrictEqual(messages, [
          `Left 6 commits behind on no branch or tag: ${newest.map((hash) => hash.slice(0, 7)).join(' ')} and 1 more`,
        ]);
      });
    } finally {
      await restore();
    }
  });

  test('refuses to check out anything while a rebase is paused', async () => {
    await repository.git('checkout', '-b', 'onto', fixture.a);
    await repository.commit('onto');
    await repository.git('checkout', '-b', 'paused', fixture.a);
    await repository.commit('paused');
    await assert.rejects(repository.git('rebase', '--exec', 'false', 'onto'));
    const [stopped] = await repository.resolve('HEAD');
    try {
      await connection.refresh();
      await withNotices(page, 'error', async (messages) => {
        await connection.receive({
          type: 'checkout',
          root: repository.root,
          target: { kind: 'branch', name: 'feature' },
        });
        assert.strictEqual(messages.length, 1);
        assert.match(messages[0], /^Couldn't check out feature/);
      });
      assert.deepStrictEqual(await repository.resolve('HEAD'), [stopped]);
      takeErrorsLogged(
        logged,
        /^Checking out branch feature failed$/,
        /^git .*switch .*feature failed: fatal: cannot switch branch while rebasing/,
      );
    } finally {
      await repository.git('rebase', '--abort').catch(() => undefined);
      await restore();
      await repository.git('branch', '-D', 'onto', 'paused');
    }
  });
});

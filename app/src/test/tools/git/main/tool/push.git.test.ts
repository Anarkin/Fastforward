import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, afterEach, beforeAll, suite, test } from 'vitest';
import type { Connection } from '../../../../harness';
import { waitFor } from '../../../../fixtures';
import {
  removeFolder,
  tempFolder,
  tempRepository,
  type TempRepository,
} from '../../../../repositories';
import { recordingLog } from '../../../../stub';
import {
  closeViews,
  failOnErrorsLogged,
  type FakePage,
  holdFetches,
  openView,
  takeErrorsLogged,
  withNotices,
  type PageMessage,
} from '../../../../harness';

function runningState(message: PageMessage): string[] {
  return message.type === 'pushing' || message.type === 'fetching'
    ? [`${message.type} ${message.running}`]
    : [];
}

suite('Git tool pushing', () => {
  let folder: string;
  let repository: TempRepository;
  let other: TempRepository;
  let remote: TempRepository;
  let page: FakePage;
  let connection: Connection;

  const { log, error: logged } = recordingLog();
  failOnErrorsLogged(logged);

  beforeAll(async () => {
    folder = tempFolder('push');
    remote = await tempRepository(path.join(folder, 'remote'), {
      bare: true,
    });
    repository = await tempRepository(path.join(folder, 'local'));
    await repository.commit('a', { shared: 'a' });
    await repository.git('remote', 'add', 'origin', remote.root);
    await repository.git('push', '-u', 'origin', 'main');
    other = await tempRepository(path.join(folder, 'other'));
    await other.git('remote', 'add', 'origin', remote.root);
    await other.git('fetch', 'origin');
    await other.git('reset', '--hard', 'origin/main');
    ({ page, connection } = await openView(
      log,
      [repository.root],
      'unwatched',
    ));
  });

  afterEach(async () => {
    fs.rmSync(path.join(remote.root, 'hooks', 'pre-receive'), { force: true });
    await repository.git('checkout', '-f', 'main');
    await repository.git('fetch', 'origin');
    await repository.git('reset', '--hard', 'origin/main');
    await other.git('fetch', 'origin');
    await other.git('reset', '--hard', 'origin/main');
    await connection.refresh();
  });

  afterAll(async () => {
    await closeViews();
    removeFolder(folder);
  });

  const pushedElsewhere = async (message: string): Promise<string> => {
    await other.commit(message);
    await other.git('push', 'origin', 'HEAD:main');
    const [pushed] = await other.resolve('HEAD');
    return pushed;
  };

  const onRemote = async (branch: string): Promise<string | undefined> =>
    (
      await remote
        .git('rev-parse', '--verify', '--quiet', branch)
        .catch(() => '')
    ).trim() || undefined;

  const push = () =>
    connection.receive({ type: 'push', root: repository.root });

  const pushedWith = async (level: 'info' | 'error'): Promise<string[]> => {
    let said: string[] = [];
    await withNotices(page, level, async (messages) => {
      await push();
      said = messages;
    });
    return said;
  };

  const refOnPage = (name: string): string | undefined =>
    page.last('repository')?.refs.find((ref) => ref.name === name)?.commit;

  test('pushes the commits the checked-out branch has over its upstream, moving the upstream on the page too', async () => {
    await repository.commit('b');
    const [local] = await repository.resolve('main');
    assert.deepStrictEqual(await pushedWith('info'), [
      'Pushed main to origin/main',
    ]);
    assert.strictEqual(await onRemote('main'), local);
    assert.strictEqual(refOnPage('origin/main'), local);
  });

  test('pushes the branch checked out when Push was asked for, though another is checked out while the push waits for a fetch', async () => {
    const held = await holdFetches(repository, 'origin', folder);
    await repository.git('branch', 'private');
    await repository.commit('mine');
    const [mine] = await repository.resolve('main');
    try {
      const fetched = connection.receive({
        type: 'fetch',
        root: repository.root,
      });
      await waitFor(held.reached, 'the fetch to reach the remote');
      let said: string[] = [];
      await withNotices(page, 'info', async (messages) => {
        const pushed = push();
        await waitFor(
          () => page.last('pushing')?.running === true,
          'the push to wait for the fetch',
        );
        await connection.receive({
          type: 'checkout',
          root: repository.root,
          target: { kind: 'branch', name: 'private' },
        });
        held.release();
        await Promise.all([pushed, fetched]);
        said = messages;
      });
      assert.deepStrictEqual(said, ['Pushed main to origin/main']);
      assert.strictEqual(await onRemote('main'), mine);
      assert.strictEqual(await onRemote('private'), undefined);
    } finally {
      await held.restore();
      await repository.git('checkout', '-f', 'main');
      await repository.git('branch', '-D', 'private');
      await repository
        .git('push', 'origin', '--delete', 'private')
        .catch(() => '');
    }
  });

  test('says it is pushing while it does, fetching nothing', async () => {
    await repository.commit('b');
    page.clear();
    await push();
    assert.deepStrictEqual(page.messages.flatMap(runningState), [
      'pushing true',
      'pushing false',
    ]);
  });

  test('says the checked-out branch is up to date when there is nothing to push', async () => {
    assert.deepStrictEqual(await pushedWith('info'), [
      'main is up to date with origin/main',
    ]);
  });

  test('pushes nothing when the checked-out branch is only behind its upstream, and says so', async () => {
    const pushed = await pushedElsewhere('theirs');
    await repository.git('fetch', 'origin');
    assert.deepStrictEqual(await pushedWith('info'), [
      'main is behind origin/main, with nothing to push',
    ]);
    assert.strictEqual(await onRemote('main'), pushed);
  });

  test('pushes nothing when the checked-out branch has diverged from its upstream, as that would drop commits there', async () => {
    const pushed = await pushedElsewhere('theirs');
    await repository.git('fetch', 'origin');
    await repository.commit('mine');
    assert.deepStrictEqual(await pushedWith('info'), [
      'main has diverged from origin/main, so pushing it would drop commits there',
    ]);
    assert.strictEqual(await onRemote('main'), pushed);
  });

  test('pushes nothing from a detached HEAD, saying it has no upstream', async () => {
    await repository.commit('b');
    await repository.git('checkout', '--detach', 'main');
    assert.deepStrictEqual(await pushedWith('info'), [
      'The checked-out commit is on no branch, so it has no upstream',
    ]);
  });

  test('publishes a branch without an upstream to the only remote, tracking it from then on', async () => {
    await repository.git('checkout', '-b', 'topic');
    await repository.commit('topic');
    const [topic] = await repository.resolve('topic');
    try {
      assert.deepStrictEqual(await pushedWith('info'), [
        'Published topic as origin/topic',
      ]);
      assert.strictEqual(await onRemote('topic'), topic);
      assert.strictEqual(
        (
          await repository.git('rev-parse', '--abbrev-ref', 'topic@{upstream}')
        ).trim(),
        'origin/topic',
      );
      assert.strictEqual(refOnPage('origin/topic'), topic);
    } finally {
      await repository.git('checkout', '-f', 'main');
      await repository.git('branch', '-D', 'topic');
      await repository.git('push', 'origin', '--delete', 'topic');
    }
  });

  test('publishes nothing when there is no remote, or more than one to choose from, saying so', async () => {
    await repository.git('checkout', '-b', 'topic');
    try {
      await repository.git('remote', 'add', 'second', remote.root);
      assert.deepStrictEqual(await pushedWith('info'), [
        "topic has no upstream, and with several remotes, it's unclear which to push it to",
      ]);
      await repository.git('remote', 'remove', 'second');
      await repository.git('remote', 'remove', 'origin');
      assert.deepStrictEqual(await pushedWith('info'), [
        "topic has no upstream, and there's no remote to push it to",
      ]);
      assert.strictEqual(await onRemote('topic'), undefined);
    } finally {
      await repository.git('remote', 'remove', 'second').catch(() => '');
      await repository
        .git('remote', 'add', 'origin', remote.root)
        .catch(() => '');
      await repository.git('fetch', 'origin');
      await repository.git('checkout', '-f', 'main');
      await repository.git('branch', '--set-upstream-to=origin/main', 'main');
      await repository.git('branch', '-D', 'topic');
    }
  });

  test('pushes nothing to an upstream deleted on the remote, rather than make it again', async () => {
    await repository.git('push', 'origin', 'main:brief');
    await repository.git('checkout', '-b', 'brief', '--track', 'origin/brief');
    await remote.git('branch', '-D', 'brief');
    await repository.git('fetch', '--prune', 'origin');
    await repository.commit('more');
    try {
      assert.deepStrictEqual(await pushedWith('info'), [
        "origin/brief, the upstream of brief, doesn't exist anymore",
      ]);
      assert.strictEqual(await onRemote('brief'), undefined);
    } finally {
      await repository.git('checkout', '-f', 'main');
      await repository.git('branch', '-D', 'brief');
    }
  });

  test("pushes nothing from a branch whose upstream has another name, as git push wouldn't either, saying so", async () => {
    await repository.git('checkout', '-b', 'feature', '--track', 'origin/main');
    await repository.commit('feature');
    const main = await onRemote('main');
    try {
      assert.deepStrictEqual(await pushedWith('info'), [
        "feature tracks origin/main, which has another name, so it wasn't pushed, as git push wouldn't push it either",
      ]);
      assert.strictEqual(await onRemote('main'), main);
      assert.strictEqual(await onRemote('feature'), undefined);
    } finally {
      await repository.git('checkout', '-f', 'main');
      await repository.git('branch', '-D', 'feature');
    }
  });

  test('pushes a branch whose upstream has another name where push.default has git push push it: to its own name, or to its upstream', async () => {
    await repository.git('checkout', '-b', 'feature', '--track', 'origin/main');
    await repository.commit('feature');
    try {
      await repository.git('config', 'push.default', 'current');
      assert.deepStrictEqual(await pushedWith('info'), [
        'Pushed feature to origin/feature',
      ]);
      const [feature] = await repository.resolve('feature');
      assert.strictEqual(await onRemote('feature'), feature);
      await repository.git('config', 'push.default', 'upstream');
      assert.deepStrictEqual(await pushedWith('info'), [
        'Pushed feature to origin/main',
      ]);
      assert.strictEqual(await onRemote('main'), feature);
    } finally {
      await repository.git('config', '--unset', 'push.default');
      await repository.git('checkout', '-f', 'main');
      await repository.git('branch', '-D', 'feature');
      await repository.git('push', 'origin', '--delete', 'feature');
    }
  });

  test('pushes to the remote set to push to, as git push would, rather than to the upstream', async () => {
    const fork = await tempRepository(path.join(folder, 'fork'), {
      bare: true,
    });
    await repository.git('remote', 'add', 'fork', fork.root);
    await repository.git('config', 'remote.pushDefault', 'fork');
    await repository.commit('mine');
    const [mine] = await repository.resolve('main');
    const upstream = await onRemote('main');
    try {
      assert.deepStrictEqual(await pushedWith('info'), [
        'Pushed main to fork/main',
      ]);
      assert.deepStrictEqual(await fork.resolve('main'), [mine]);
      assert.strictEqual(await onRemote('main'), upstream);
    } finally {
      await repository.git('config', '--unset', 'remote.pushDefault');
      await repository.git('remote', 'remove', 'fork');
    }
  });

  test('pushes a branch whose upstream is on a remote named by its URL, as gh pr checkout sets up, there, rather than publish it to the only remote', async () => {
    const fork = await tempRepository(path.join(folder, 'pull-request'), {
      bare: true,
    });
    await repository.git('push', fork.root, 'main:fix');
    await repository.git('checkout', '-b', 'fix');
    await repository.git('config', 'branch.fix.remote', fork.root);
    await repository.git('config', 'branch.fix.merge', 'refs/heads/fix');
    await repository.commit('fix');
    const [fix] = await repository.resolve('fix');
    try {
      assert.deepStrictEqual(await pushedWith('info'), [
        `Pushed fix to ${fork.root}/fix`,
      ]);
      assert.deepStrictEqual(await fork.resolve('fix'), [fix]);
      assert.strictEqual(await onRemote('fix'), undefined);
      assert.strictEqual(
        (await repository.git('config', 'branch.fix.remote')).trim(),
        fork.root,
      );
    } finally {
      await repository.git('checkout', '-f', 'main');
      await repository.git('branch', '-D', 'fix');
    }
  });

  test("pushes nothing from a branch whose upstream is a pull request's ref, as git push wouldn't either", async () => {
    await repository.git('checkout', '-b', 'review');
    await repository.git('config', 'branch.review.remote', 'origin');
    await repository.git('config', 'branch.review.merge', 'refs/pull/1/head');
    await repository.commit('review');
    try {
      assert.deepStrictEqual(await pushedWith('info'), [
        "review tracks origin/refs/pull/1/head, which has another name, so it wasn't pushed, as git push wouldn't push it either",
      ]);
      assert.strictEqual(await onRemote('review'), undefined);
    } finally {
      await repository.git('checkout', '-f', 'main');
      await repository.git('branch', '-D', 'review');
    }
  });

  test('pushes nothing to an upstream that is a local branch, saying it has no remote', async () => {
    await repository.git('checkout', '-b', 'follower', '--track', 'main');
    await repository.commit('more');
    try {
      assert.deepStrictEqual(await pushedWith('info'), [
        'follower tracks the local branch main, so it has no remote to push to',
      ]);
    } finally {
      await repository.git('checkout', '-f', 'main');
      await repository.git('branch', '-D', 'follower');
    }
  });

  test('says the remote moved on since the last fetch when it rejects the push for that, then fetches to show it', async () => {
    const pushed = await pushedElsewhere('theirs');
    await repository.commit('mine');
    page.clear();
    assert.deepStrictEqual(await pushedWith('info'), [
      "origin/main has new commits on the remote that main lacks, so it wasn't pushed",
    ]);
    assert.strictEqual(await onRemote('main'), pushed);
    assert.strictEqual(refOnPage('origin/main'), pushed);
    assert.deepStrictEqual(page.messages.flatMap(runningState), [
      'pushing true',
      'pushing false',
      'fetching true',
      'fetching false',
    ]);
  });

  test("says why the remote rejected a push, leaving out git's hints", async () => {
    fs.writeFileSync(
      path.join(remote.root, 'hooks', 'pre-receive'),
      '#!/bin/sh\necho protected by policy >&2\nexit 1\n',
      { mode: 0o755 },
    );
    await repository.commit('b');
    const said = await pushedWith('error');
    assert.strictEqual(said.length, 1);
    assert.match(said[0] ?? '', /^Couldn't push\. .*protected by policy/s);
    assert.doesNotMatch(said[0] ?? '', /hint:/);
    takeErrorsLogged(logged, /^Pushing failed$/, /^git push .* failed: /s);
  });

  test('lets a fetch asked for while a push runs wait for it, as both move the same remote branches', async () => {
    const gate = path.join(folder, 'gate');
    const started = path.join(folder, 'started');
    fs.writeFileSync(
      path.join(remote.root, 'hooks', 'pre-receive'),
      `#!/bin/sh\ntouch '${started.replaceAll('\\', '/')}'\nwhile [ ! -e '${gate.replaceAll('\\', '/')}' ]; do sleep 0.1; done\n`,
      { mode: 0o755 },
    );
    await repository.commit('b');
    let fetched = false;
    try {
      const pushing = push();
      await waitFor(
        () => fs.existsSync(started),
        'the push to reach the remote',
      );
      const fetching = connection
        .receive({ type: 'fetch', root: repository.root })
        .then(() => {
          fetched = true;
        });
      await new Promise((resolve) => setTimeout(resolve, 1500));
      assert.strictEqual(fetched, false);
      fs.writeFileSync(gate, '');
      await Promise.all([pushing, fetching]);
      assert.strictEqual(fetched, true);
    } finally {
      fs.writeFileSync(gate, '');
      fs.rmSync(gate, { force: true });
      fs.rmSync(started, { force: true });
    }
  });
});

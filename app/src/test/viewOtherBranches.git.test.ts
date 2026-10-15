import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, afterEach, beforeAll, suite, test } from 'vitest';
import type { ToWebview } from '../shared/protocol';
import type { Connection, FastforwardView } from '../view';
import { waitFor } from './fixtures';
import {
  removeFolder,
  tempFolder,
  tempRepository,
  type TempRepository,
} from './repositories';
import { recordingLog } from './stub';
import {
  closeViews,
  failOnErrorsLogged,
  type FakePage,
  gate,
  openView,
  stubMethod,
  takeErrorsLogged,
  withNotices,
} from './viewHarness';

function running(message: ToWebview): string[] {
  return message.type === 'pullingBranch' || message.type === 'pushingBranch'
    ? [`${message.type} ${message.names.join(' ')}`.trim()]
    : [];
}

suite('View pulling and pushing other branches', () => {
  let folder: string;
  let repository: TempRepository;
  let other: TempRepository;
  let remote: TempRepository;
  let view: FastforwardView;
  let page: FakePage;
  let connection: Connection;

  const { log, error: logged } = recordingLog();
  failOnErrorsLogged(logged);

  beforeAll(async () => {
    folder = tempFolder('other-branches');
    remote = await tempRepository(path.join(folder, 'remote'), {
      bare: true,
    });
    repository = await tempRepository(path.join(folder, 'local'));
    await repository.commit('a', { shared: 'a' });
    await repository.git('remote', 'add', 'origin', remote.root);
    await repository.git('push', '-u', 'origin', 'main');
    other = await tempRepository(path.join(folder, 'other'));
    await other.git('remote', 'add', 'origin', remote.root);
    ({ view, page, connection } = await openView(
      log,
      [repository.root],
      'unwatched',
    ));
  });

  afterEach(async () => {
    await repository.git('checkout', '-f', 'main');
    for (const branch of (
      await repository.git(
        'for-each-ref',
        '--format=%(refname:short)',
        'refs/heads',
      )
    ).split('\n')) {
      if (branch && branch !== 'main') {
        await repository.git('branch', '-D', branch);
      }
    }
    for (const branch of (
      await remote.git(
        'for-each-ref',
        '--format=%(refname:short)',
        'refs/heads',
      )
    ).split('\n')) {
      if (branch && branch !== 'main') {
        await remote.git('branch', '-D', branch);
      }
    }
    await repository.git('fetch', '--prune', 'origin');
    await connection.refresh();
  });

  afterAll(async () => {
    await closeViews();
    removeFolder(folder);
  });

  const tracked = async (name: string): Promise<string> => {
    await repository.git('branch', name, 'main');
    await repository.git('push', '-u', 'origin', name);
    const [commit] = await repository.resolve(name);
    return commit;
  };

  const moveOnRemote = async (name: string): Promise<string> => {
    await other.git('fetch', 'origin');
    await other.git('checkout', '-B', name, `origin/${name}`);
    await other.commit(`more on ${name}`, { [`${name}.txt`]: 'theirs' });
    await other.git('push', 'origin', name);
    const [pushed] = await other.resolve('HEAD');
    return pushed;
  };

  const send = async (
    type: 'pullBranch' | 'pushBranch',
    name: string,
    level: 'info' | 'error' = 'info',
  ): Promise<string[]> => {
    let said: string[] = [];
    await withNotices(page, level, async (messages) => {
      await connection.receive({ type, root: repository.root, name });
      said = messages;
    });
    return said;
  };

  const onRemote = async (name: string): Promise<string | undefined> =>
    (
      await remote
        .git('rev-parse', '--verify', '--quiet', `refs/heads/${name}`)
        .catch(() => '')
    ).trim() || undefined;

  test('pulls a branch lagging behind its upstream without checking it out, leaving HEAD and the files alone', async () => {
    await tracked('side');
    const pushed = await moveOnRemote('side');
    fs.writeFileSync(path.join(repository.root, 'shared'), 'mine');
    page.clear();
    assert.deepStrictEqual(await send('pullBranch', 'side'), []);
    assert.deepStrictEqual(await repository.resolve('side'), [pushed]);
    assert.strictEqual(
      (await repository.git('symbolic-ref', '--short', 'HEAD')).trim(),
      'main',
    );
    assert.strictEqual(
      fs.readFileSync(path.join(repository.root, 'shared'), 'utf8'),
      'mine',
    );
    assert.ok(!fs.existsSync(path.join(repository.root, 'side.txt')));
    assert.strictEqual(
      page.last('repository')?.refs.find((ref) => ref.name === 'side')?.commit,
      pushed,
    );
    assert.deepStrictEqual(page.messages.flatMap(running), [
      'pullingBranch side',
      'pullingBranch',
    ]);
    fs.writeFileSync(path.join(repository.root, 'shared'), 'a');
  });

  test("pulls a branch from its upstream fetched from its own remote when another remote can't be fetched, saying that fetch failed", async () => {
    await tracked('lagging');
    const pushed = await moveOnRemote('lagging');
    await repository.git('remote', 'add', 'gone', path.join(folder, 'gone'));
    try {
      const said = await send('pullBranch', 'lagging', 'error');
      assert.strictEqual(said.length, 1);
      assert.match(said[0] ?? '', /^Couldn't fetch\. .*could not fetch gone/s);
      assert.deepStrictEqual(await repository.resolve('lagging'), [pushed]);
      takeErrorsLogged(
        logged,
        /^Fetching every remote failed$/,
        /^git -c remote\.origin\.prune=true -c remote\.gone\.prune=true fetch --progress --all --porcelain failed: /,
      );
    } finally {
      await repository.git('remote', 'remove', 'gone');
    }
  });

  test('pulls nothing into a branch up to date, ahead, diverged or without an upstream, saying why', async () => {
    await tracked('even');
    assert.deepStrictEqual(await send('pullBranch', 'even'), [
      'even is up to date with origin/even',
    ]);
    await tracked('apart');
    await moveOnRemote('apart');
    await repository.git('fetch', 'origin');
    await repository.git('checkout', 'apart');
    await repository.commit('mine on apart');
    const [mine] = await repository.resolve('apart');
    await repository.git('checkout', 'main');
    assert.deepStrictEqual(await send('pullBranch', 'apart'), [
      "apart has diverged from origin/apart, so it can't be fast-forwarded",
    ]);
    assert.deepStrictEqual(await repository.resolve('apart'), [mine]);
    await repository.git('branch', 'alone', 'main');
    assert.deepStrictEqual(await send('pullBranch', 'alone'), [
      'alone has no upstream',
    ]);
  });

  test('pulls nothing into a branch checked out in another worktree, as that worktree would fall out of step', async () => {
    const start = await tracked('elsewhere');
    await moveOnRemote('elsewhere');
    const tree = path.join(folder, 'tree');
    await repository.git('worktree', 'add', tree, 'elsewhere');
    try {
      assert.deepStrictEqual(await send('pullBranch', 'elsewhere'), [
        'elsewhere is checked out in another worktree, so pull it there',
      ]);
      assert.deepStrictEqual(await repository.resolve('elsewhere'), [start]);
    } finally {
      await repository.git('worktree', 'remove', '--force', tree);
    }
  });

  test('pulls nothing into a branch checked out in another worktree while fetching, as that worktree would fall out of step', async () => {
    const start = await tracked('meanwhile');
    await moveOnRemote('meanwhile');
    const tree = path.join(folder, 'meanwhile');
    await repository.git('config', 'fetch.prune', 'true');
    const restore = Reflect.get(view, 'fetchRemotes');
    stubMethod(view, 'fetchRemotes', async (original, ...args) => {
      const fetched = await original(...args);
      await repository.git('worktree', 'add', tree, 'meanwhile');
      return fetched;
    });
    try {
      assert.deepStrictEqual(await send('pullBranch', 'meanwhile'), [
        "meanwhile is checked out, or being rebased or bisected, in a worktree, so it wasn't pulled",
      ]);
      assert.deepStrictEqual(await repository.resolve('meanwhile'), [start]);
    } finally {
      Reflect.set(view, 'fetchRemotes', restore);
      await repository.git('config', '--unset', 'fetch.prune');
      await repository.git('worktree', 'remove', '--force', tree);
    }
  });

  test('pulls nothing into a branch being rebased, as the rebase could no longer finish on it', async () => {
    const start = await tracked('rebased');
    await moveOnRemote('rebased');
    await repository.git('checkout', 'rebased');
    await repository.git('rebase', '--root', '--exec', 'false').catch(() => '');
    try {
      assert.deepStrictEqual(await send('pullBranch', 'rebased'), [
        "rebased is checked out, or being rebased or bisected, in a worktree, so it wasn't pulled",
      ]);
      assert.deepStrictEqual(await repository.resolve('rebased'), [start]);
    } finally {
      await repository.git('rebase', '--abort');
    }
  });

  test('moves a branch pulled only once a checkout started before it is done, pulling it as the checked-out branch if the checkout chose it', async () => {
    await tracked('next');
    const pushed = await moveOnRemote('next');
    const held = gate();
    let checkingOut = false;
    const restore = Reflect.get(view, 'checkoutNow');
    stubMethod(view, 'checkoutNow', async (original, ...args) => {
      checkingOut = true;
      await held.opened;
      return original(...args);
    });
    try {
      page.clear();
      const checkedOut = connection.receive({
        type: 'checkout',
        root: repository.root,
        target: { kind: 'branch', name: 'next' },
      });
      await waitFor(() => checkingOut, 'the checkout to start');
      const pulled = send('pullBranch', 'next');
      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.deepStrictEqual(page.messages.flatMap(running), [
        'pullingBranch next',
      ]);
      assert.strictEqual(
        (await repository.git('symbolic-ref', '--short', 'HEAD')).trim(),
        'main',
      );
      held.open();
      await checkedOut;
      assert.deepStrictEqual(await pulled, []);
    } finally {
      Reflect.set(view, 'checkoutNow', restore);
    }
    assert.deepStrictEqual(await repository.resolve('HEAD'), [pushed]);
    assert.ok(fs.existsSync(path.join(repository.root, 'next.txt')));
  });

  test('lets a checkout asked for while a branch pull fetches go ahead without waiting for the fetch', async () => {
    const start = await tracked('fetching');
    const pushed = await moveOnRemote('fetching');
    await repository.git('branch', 'elsewhere', 'main');
    const held = gate();
    let fetching = false;
    const restore = Reflect.get(view, 'fetchRemotes');
    stubMethod(view, 'fetchRemotes', async (original, ...args) => {
      fetching = true;
      await held.opened;
      return original(...args);
    });
    try {
      page.clear();
      const pulled = send('pullBranch', 'fetching');
      await waitFor(() => fetching, 'the fetch to start');
      await connection.receive({
        type: 'checkout',
        root: repository.root,
        target: { kind: 'branch', name: 'elsewhere' },
      });
      assert.strictEqual(
        (await repository.git('symbolic-ref', '--short', 'HEAD')).trim(),
        'elsewhere',
      );
      assert.deepStrictEqual(await repository.resolve('fetching'), [start]);
      held.open();
      assert.deepStrictEqual(await pulled, []);
    } finally {
      Reflect.set(view, 'fetchRemotes', restore);
    }
    assert.deepStrictEqual(await repository.resolve('fetching'), [pushed]);
  });

  test('pulls the checked-out branch as the blue bubble does, if the branch asked for turns out to be it', async () => {
    await tracked('current');
    const pushed = await moveOnRemote('current');
    await repository.git('checkout', 'current');
    assert.deepStrictEqual(await send('pullBranch', 'current'), []);
    assert.deepStrictEqual(await repository.resolve('HEAD'), [pushed]);
    assert.ok(fs.existsSync(path.join(repository.root, 'current.txt')));
  });

  test('pushes a branch ahead of its upstream without checking it out, and publishes one without an upstream', async () => {
    await tracked('ahead');
    await repository.git('checkout', 'ahead');
    await repository.commit('unpushed on ahead');
    const [ahead] = await repository.resolve('ahead');
    await repository.git('checkout', 'main');
    page.clear();
    assert.deepStrictEqual(await send('pushBranch', 'ahead'), [
      'Pushed ahead to origin/ahead',
    ]);
    assert.strictEqual(await onRemote('ahead'), ahead);
    assert.deepStrictEqual(page.messages.flatMap(running), [
      'pushingBranch ahead',
      'pushingBranch',
    ]);
    await repository.git('branch', 'fresh', 'main');
    assert.deepStrictEqual(await send('pushBranch', 'fresh'), [
      'Published fresh as origin/fresh',
    ]);
    assert.ok(await onRemote('fresh'));
    assert.strictEqual(
      (await repository.git('symbolic-ref', '--short', 'HEAD')).trim(),
      'main',
    );
  });

  test('keeps a branch pushing while another one finishes, so both stay disabled until each is done', async () => {
    await repository.git('branch', 'first', 'main');
    await repository.git('branch', 'second', 'main');
    const held = gate();
    let calls = 0;
    const restore = Reflect.get(view, 'afterRemoteWork');
    stubMethod(view, 'afterRemoteWork', async (original, ...args) => {
      calls += 1;
      if (calls === 1) {
        await held.opened;
      }
      return original(...args);
    });
    try {
      page.clear();
      const first = send('pushBranch', 'first');
      await waitFor(() => calls === 1, 'the first push to start');
      await send('pushBranch', 'second');
      held.open();
      await first;
    } finally {
      Reflect.set(view, 'afterRemoteWork', restore);
    }
    assert.deepStrictEqual(page.messages.flatMap(running), [
      'pushingBranch first',
      'pushingBranch first second',
      'pushingBranch first',
      'pushingBranch',
    ]);
    assert.ok(await onRemote('first'));
    assert.ok(await onRemote('second'));
  });

  test('pulls and pushes no branch the repository lacks, as the page may ask for any name', async () => {
    assert.deepStrictEqual(await send('pullBranch', 'nowhere'), []);
    assert.deepStrictEqual(await send('pushBranch', '--mirror', 'error'), []);
    assert.strictEqual(await onRemote('nowhere'), undefined);
  });
});

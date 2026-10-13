import * as assert from 'node:assert';
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
  withNotices,
} from './viewHarness';

function pushingTag(message: ToWebview): string[] {
  return message.type === 'pushingTag' ? [message.names.join(' ')] : [];
}

suite('View pushing tags', () => {
  let folder: string;
  let repository: TempRepository;
  let remote: TempRepository;
  let view: FastforwardView;
  let page: FakePage;
  let connection: Connection;
  let a: string;
  let b: string;

  const { log, error: logged } = recordingLog();
  failOnErrorsLogged(logged);

  beforeAll(async () => {
    folder = tempFolder('push-tag');
    remote = await tempRepository(path.join(folder, 'remote'), {
      bare: true,
    });
    repository = await tempRepository(path.join(folder, 'local'));
    await repository.commit('a');
    await repository.commit('b');
    [a, b] = await repository.resolve('main~1', 'main');
    await repository.git('remote', 'add', 'origin', remote.root);
    await repository.git('push', '-u', 'origin', 'main');
    ({ view, page, connection } = await openView(
      log,
      [repository.root],
      'unwatched',
    ));
    await connection.receive({ type: 'fetch', root: repository.root });
    await waitFor(
      () => page.last('repository')?.tagRemote === 'origin',
      'the tags of origin to be listed',
    );
  });

  afterEach(async () => {
    for (const tag of (await repository.git('tag')).split('\n')) {
      if (tag) {
        await repository.git('tag', '-d', tag);
      }
    }
    for (const tag of (await remote.git('tag')).split('\n')) {
      if (tag) {
        await remote.git('tag', '-d', tag);
      }
    }
  });

  afterAll(async () => {
    await closeViews();
    removeFolder(folder);
  });

  const onRemote = async (tag: string): Promise<string | undefined> =>
    (
      await remote
        .git('rev-parse', '--verify', '--quiet', `refs/tags/${tag}^{commit}`)
        .catch(() => '')
    ).trim() || undefined;

  const pushedWith = async (
    level: 'info' | 'error',
    name: string,
  ): Promise<string[]> => {
    let said: string[] = [];
    await withNotices(page, level, async (messages) => {
      await connection.receive({
        type: 'pushTag',
        root: repository.root,
        name,
      });
      said = messages;
    });
    return said;
  };

  test('names the remote a tag would be pushed to only once the tags there are known', async () => {
    const opened = await openView(log, [repository.root], 'unwatched');
    try {
      assert.strictEqual(opened.page.last('repository')?.tagRemote, undefined);
    } finally {
      opened.connection.dispose();
    }
    assert.strictEqual(page.last('repository')?.tagRemote, 'origin');
  });

  test('pushes a tag to the only remote, showing its twin there at once, without listing the tags there again', async () => {
    await repository.git('tag', '-a', 'v1', '-m', 'release', a);
    await connection.refresh();
    page.clear();
    assert.deepStrictEqual(await pushedWith('info', 'v1'), [
      'Pushed tag v1 to origin',
    ]);
    assert.strictEqual(await onRemote('v1'), a);
    assert.deepStrictEqual(
      page
        .last('repository')
        ?.refs.filter((ref) => ref.kind === 'remote-tag')
        .map((ref) => [ref.name, ref.commit]),
      [['origin/v1', a]],
    );
    assert.deepStrictEqual(page.messages.flatMap(pushingTag), ['v1', '']);
  });

  test('keeps a tag pushing while another one finishes, so both stay disabled until each is done', async () => {
    await repository.git('tag', 'v6', a);
    await repository.git('tag', 'v7', b);
    await connection.refresh();
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
      const first = pushedWith('info', 'v6');
      await waitFor(() => calls === 1, 'the first push to start');
      await pushedWith('info', 'v7');
      held.open();
      await first;
    } finally {
      Reflect.set(view, 'afterRemoteWork', restore);
    }
    assert.deepStrictEqual(page.messages.flatMap(pushingTag), [
      'v6',
      'v6 v7',
      'v6',
      '',
    ]);
    assert.strictEqual(await onRemote('v6'), a);
    assert.strictEqual(await onRemote('v7'), b);
  });

  test('pushes nothing over a tag of the same name the remote has on another commit, saying so', async () => {
    await repository.git('tag', 'v2', b);
    await repository.git('push', 'origin', 'v2');
    await repository.git('tag', '-f', 'v2', a);
    assert.deepStrictEqual(await pushedWith('info', 'v2'), [
      "origin already has a tag v2 on another commit, so it wasn't pushed",
    ]);
    assert.strictEqual(await onRemote('v2'), b);
  });

  test('says a tag is already on the remote, on the same commit, rather than push it again', async () => {
    await repository.git('tag', 'v5', a);
    await repository.git('push', 'origin', 'v5');
    await connection.receive({ type: 'fetch', root: repository.root });
    await waitFor(
      () =>
        page
          .last('repository')
          ?.refs.some((ref) => ref.name === 'origin/v5') === true,
      'the tags of origin to be listed again',
    );
    page.clear();
    assert.deepStrictEqual(await pushedWith('info', 'v5'), [
      'v5 is already on origin',
    ]);
    assert.deepStrictEqual(page.messages.flatMap(pushingTag), []);
  });

  test('pushes no tag the repository lacks, as the page may ask for any name', async () => {
    assert.deepStrictEqual(await pushedWith('info', 'nowhere'), []);
    assert.deepStrictEqual(await pushedWith('error', '--mirror'), []);
    assert.strictEqual(await onRemote('nowhere'), undefined);
  });

  test("pushes a tag to the remote of the checked-out branch's upstream when there are several, and to none when it tracks none", async () => {
    const second = await tempRepository(path.join(folder, 'second'), {
      bare: true,
    });
    await repository.git('remote', 'add', 'second', second.root);
    await repository.git('tag', 'v3', a);
    try {
      assert.deepStrictEqual(await pushedWith('info', 'v3'), [
        'Pushed tag v3 to origin',
      ]);
      await repository.git('checkout', '-b', 'loner');
      await repository.git('tag', 'v4', a);
      assert.deepStrictEqual(await pushedWith('info', 'v4'), [
        "With several remotes, and loner tracking none of them, it's unclear where to push v4",
      ]);
      assert.strictEqual(await onRemote('v4'), undefined);
    } finally {
      await repository.git('checkout', '-f', 'main');
      await repository.git('branch', '-D', 'loner').catch(() => '');
      await repository.git('remote', 'remove', 'second');
    }
  });
});

import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, suite, test } from 'vitest';
import type { Connection } from '../../../../helpers/harness';
import { waitFor } from '../../../../helpers/fixtures';
import {
  removeFolder,
  tempFolder,
  tempRepository,
  type TempRepository,
} from '../../../../helpers/repositories';
import { recordingLog, failOnErrorsLogged } from '../../../../helpers/stub';
import {
  closeViews,
  gate,
  openView,
  stubMethod,
  tabOf,
} from '../../../../helpers/harness';
import { type FakePage } from '../../../../helpers/fakePage';

suite('Git tool updating by itself', () => {
  let folder: string;
  let repository: TempRepository;
  let remote: TempRepository;
  let pusher: TempRepository;
  let page: FakePage;
  let connection: Connection;

  const { log, error: logged } = recordingLog();
  failOnErrorsLogged(logged);

  beforeAll(async () => {
    folder = tempFolder('fetch');
    repository = await tempRepository(path.join(folder, 'local'));
    await repository.commit('a');
    remote = await tempRepository(path.join(folder, 'remote'), {
      bare: true,
    });
    await repository.git('remote', 'add', 'origin', remote.root);
    await repository.git('push', '-u', 'origin', 'main');
    pusher = await tempRepository(path.join(folder, 'pusher'));
    await pusher.git('pull', remote.root, 'main');
    ({ page, connection } = await openView(log, [repository.root], {
      watched: true,
    }));
  });

  afterAll(async () => {
    await closeViews();
    removeFolder(folder);
  });

  async function push(message: string, refspecs = ['main']): Promise<string> {
    await pusher.commit(message);
    await pusher.git('push', remote.root, ...refspecs);
    const [pushed] = await pusher.resolve('HEAD');
    return pushed;
  }

  test('updates by itself when a fetch brings new commits', async () => {
    const fetched = await push('from elsewhere');
    page.clear();
    try {
      await repository.git('fetch');
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
      await repository.git('merge', '--ff-only', 'origin/main');
      await connection.refresh();
    }
  });

  test('updates by itself when a file changes in the working tree', async () => {
    page.clear();
    fs.writeFileSync(path.join(repository.root, 'edited.txt'), 'edited\n');
    try {
      await waitFor(
        () => page.last('workingTree')?.files === 1,
        'the changed file to show',
      );
    } finally {
      fs.rmSync(path.join(repository.root, 'edited.txt'));
      await waitFor(
        () => page.last('workingTree')?.files === 0,
        'the removed file to go',
      );
    }
  });

  test('reads the refs again by itself only when the git folder changes', async () => {
    const opened = await openView(log, [repository.root], { watched: true });
    let reads = 0;
    stubMethod(opened.view, 'refsOf', (original, ...args) => {
      reads++;
      return original(...args);
    });
    const file = path.join(repository.root, 'saved.txt');
    try {
      fs.writeFileSync(file, 'saved\n');
      await waitFor(
        () => opened.page.last('workingTree')?.files === 1,
        'the saved file to show',
      );
      assert.strictEqual(reads, 0);
      await repository.git('tag', 'watched');
      await waitFor(
        () =>
          opened.page
            .last('repository')
            ?.refs.some((ref) => ref.name === 'watched') === true,
        'the new tag',
      );
      assert.ok(reads > 0);
    } finally {
      opened.connection.dispose();
      fs.rmSync(file);
      await repository.git('update-ref', '-d', 'refs/tags/watched');
      await waitFor(
        () => page.last('workingTree')?.files === 0,
        'the removed file to go',
      );
    }
  });

  test('keeps updating a tab opened again while the watcher of the closed one still starts', async () => {
    const second = await tempRepository(path.join(folder, 'second-watched'));
    await second.commit('second');
    const opened = await openView(log, [repository.root, second.root], {
      ready: false,
      watched: true,
    });
    const started: (() => void)[] = [];
    stubMethod(opened.view, 'startWatching', async (original, ...args) => {
      const watcher = await original(...args);
      const held = gate();
      started.push(held.open);
      await held.opened;
      return watcher;
    });
    try {
      const handled = [opened.connection.receive({ type: 'ready' })];
      await waitFor(() => started.length === 1, 'the first watcher');
      handled.push(
        opened.connection.receive({
          type: 'closeTab',
          tab: tabOf(opened.page, repository.root),
        }),
      );
      await waitFor(() => started.length === 2, "the next tab's watcher");
      handled.push(
        opened.connection.receive({
          type: 'openRepository',
          root: repository.root,
        }),
      );
      await waitFor(() => started.length === 3, "the reopened tab's watcher");
      for (const open of started) {
        open();
        await new Promise((resolve) => setImmediate(resolve));
      }
      await Promise.all(handled);
      await waitFor(
        () => opened.page.last('workingTree') !== undefined,
        'the working tree',
      );
      opened.page.clear();
      fs.writeFileSync(path.join(repository.root, 'watched.txt'), 'new\n');
      await waitFor(
        () => opened.page.last('workingTree') !== undefined,
        'the reopened tab to update',
      );
    } finally {
      opened.connection.dispose();
      fs.rmSync(path.join(repository.root, 'watched.txt'), { force: true });
    }
  });

  test('calls off starting the watcher of a tab switched away from, as on Linux it walks the whole tree first', async () => {
    const second = await tempRepository(path.join(folder, 'second-switched'));
    await second.commit('second');
    const opened = await openView(log, [repository.root, second.root], {
      ready: false,
      watched: true,
    });
    const signals: unknown[] = [];
    const held = gate();
    stubMethod(opened.view, 'startWatching', async (original, ...args) => {
      signals.push(args[2]);
      const watcher = await original(...args);
      await held.opened;
      return watcher;
    });
    try {
      const ready = opened.connection.receive({ type: 'ready' });
      await waitFor(() => signals.length === 1, 'the first watcher');
      const selected = opened.connection.receive({
        type: 'selectTab',
        tab: tabOf(opened.page, second.root),
      });
      await waitFor(() => signals.length === 2, "the next tab's watcher");
      assert.deepStrictEqual(
        signals.map(
          (signal) => signal instanceof AbortSignal && signal.aborted,
        ),
        [true, false],
      );
      held.open();
      await Promise.all([ready, selected]);
    } finally {
      opened.connection.dispose();
    }
  });
});

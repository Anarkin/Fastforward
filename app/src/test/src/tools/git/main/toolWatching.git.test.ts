import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { replaceBuiltin } from '../../../../helpers/builtins';
import { plainOf } from '../../../../../lib/shared/sentences';
import { strings } from '../../../../../lib/shared/strings';
import { waitFor } from '../../../../helpers/fixtures';
import { type TempRepository } from '../../../../helpers/repositories';
import {
  recordingLog,
  failOnErrorsLogged,
  takeErrorsLogged,
} from '../../../../helpers/stub';
import { watchesRecursively } from '../../../../../tools/git/main/watch';
import {
  closeViews,
  gate,
  idleOnlyOnceOpened,
  openView,
  reopen,
  stubMethod,
  type OpenView,
} from '../../../../helpers/harness';
import { viewRepositories } from '../../../../helpers/gitFixtures';
import { withNotices } from '../../../../helpers/fakePage';
import { removeFolder } from '../../../../helpers/tempFolders';

suite('Git tool watching the folder of a tab', () => {
  let folder: string;
  let repository: TempRepository;

  const { log, error: logged } = recordingLog();
  failOnErrorsLogged(logged);

  beforeAll(async () => {
    ({ folder, repository } = await viewRepositories());
  });

  afterAll(async () => {
    await closeViews();
    removeFolder(folder);
  });

  test('shows a tab while its watcher starts', async () => {
    const started = gate();
    const opened = await openView(log, [repository.root], {
      ready: false,
      watched: true,
    });
    stubMethod(opened.view, 'watch', async (original, ...args) => {
      await started.opened;
      return original(...args);
    });
    try {
      const ready = opened.connection.receive({ type: 'ready' });
      await waitFor(
        () => opened.page.last('commits') !== undefined,
        'the history',
      );
      started.open();
      await ready;
    } finally {
      opened.connection.dispose();
    }
  });

  test("shows a tab whose folder can't be watched, saying changes made outside the app won't show until it is opened again, which watches it anew", async () => {
    const opened = await openView(log, [repository.root], {
      ready: false,
      watched: true,
    });
    let starts = 0;
    stubMethod(opened.view, 'startWatching', (original, ...args) => {
      starts++;
      return starts > 1
        ? original(...args)
        : Promise.reject(
            Object.assign(
              new Error(
                `EISDIR: illegal operation on a directory, watch '${repository.root}'`,
              ),
              { code: 'EISDIR', syscall: 'watch', path: repository.root },
            ),
          );
    });
    try {
      await withNotices(opened.page, 'error', async (notices) => {
        await opened.connection.receive({ type: 'ready' });
        assert.deepStrictEqual(notices, [
          plainOf(strings.messages.couldNotWatch(repository.root)),
        ]);
      });
      assert.strictEqual(opened.page.last('error'), undefined);
      assert.notStrictEqual(opened.page.last('commits'), undefined);
      takeErrorsLogged(logged, /^Watching .* failed$/, /^EISDIR: /);
    } finally {
      opened.connection.dispose();
    }
    const reloaded = reopen(opened.view);
    try {
      await reloaded.ready;
      assert.strictEqual(starts, 2);
      assert.strictEqual(reloaded.page.last('notice'), undefined);
    } finally {
      reloaded.connection.dispose();
    }
  });

  test('refreshes once its watcher has started when starting took longer than a change waits to be told, as no watcher was there to tell of the changes made meanwhile', async () => {
    const started = gate();
    const opened = await openView(log, [repository.root], {
      ready: false,
      watched: true,
    });
    stubMethod(opened.view, 'startWatching', async (original, ...args) => {
      await started.opened;
      return original(...args);
    });
    const file = path.join(repository.root, 'made-while-watching-starts.txt');
    try {
      const ready = opened.connection.receive({ type: 'ready' });
      await waitFor(
        () => opened.page.last('workingTree') !== undefined,
        'the working tree',
      );
      const before = opened.page.last('workingTree')?.files ?? 0;
      fs.writeFileSync(file, 'new\n');
      await new Promise((resolve) => setTimeout(resolve, 150));
      started.open();
      await ready;
      await waitFor(
        () => opened.page.last('workingTree')?.files === before + 1,
        'the file made while the watcher started',
      );
    } finally {
      opened.connection.dispose();
      fs.rmSync(file, { force: true });
    }
  });

  test("says changes made outside the app won't show once a folder it watches recursively stops being watched", async (context) => {
    if (!watchesRecursively()) {
      context.skip();
    }
    const nodeFs = process.getBuiltinModule('node:fs');
    const { watch } = nodeFs;
    const made: fs.FSWatcher[] = [];
    replaceBuiltin(nodeFs, 'watch', (...args: Parameters<typeof watch>) => {
      const real = watch(...args);
      made.push(real);
      return real;
    });
    let opened: OpenView;
    try {
      opened = await openView(log, [repository.root], { watched: true });
    } finally {
      replaceBuiltin(nodeFs, 'watch', watch);
    }
    try {
      await withNotices(opened.page, 'error', (notices) => {
        made[0].emit(
          'error',
          Object.assign(new Error('EPERM: operation not permitted'), {
            code: 'EPERM',
          }),
        );
        assert.deepStrictEqual(notices, [
          plainOf(strings.messages.couldNotWatch(repository.root)),
        ]);
        return Promise.resolve();
      });
      takeErrorsLogged(logged, /^Watching .* failed$/, /^EPERM: /);
    } finally {
      opened.connection.dispose();
    }
  });

  test('shows a notice posted while the page loads again once the page is back, as one saved settings or a crash reloads it', async () => {
    const failing = gate();
    const opened = await openView(log, [repository.root], {
      ready: false,
      watched: true,
    });
    let starts = 0;
    stubMethod(opened.view, 'startWatching', async () => {
      starts++;
      if (starts > 1) {
        return { dispose: () => Promise.resolve() };
      }
      await failing.opened;
      throw Object.assign(
        new Error(`EPERM: operation not permitted, watch '${repository.root}'`),
        { code: 'EPERM', syscall: 'watch', path: repository.root },
      );
    });
    const ready = opened.connection.receive({ type: 'ready' });
    await waitFor(() => starts === 1, 'the watcher to start');
    opened.connection.dispose();
    failing.open();
    await ready;
    const reloaded = reopen(opened.view);
    try {
      await reloaded.ready;
      assert.deepStrictEqual(
        reloaded.page.messages
          .filter((message) => message.type === 'notice')
          .map((message) => message.message),
        [strings.messages.couldNotWatch(repository.root)],
      );
      takeErrorsLogged(logged, /^Watching .* failed$/, /^EPERM: /);
    } finally {
      reloaded.connection.dispose();
    }
  });

  test('is idle only once the watcher of a closed page has stopped', async () => {
    const held = gate();
    const opened = await openView(log, [repository.root], {
      ready: false,
      watched: true,
    });
    stubMethod(opened.view, 'startWatching', () =>
      Promise.resolve({ dispose: () => held.opened }),
    );
    await opened.connection.receive({ type: 'ready' });
    opened.connection.dispose();
    await idleOnlyOnceOpened(opened.view, held);
  });

  test('is idle only once a watcher started for a page closed meanwhile has stopped', async () => {
    const started = gate();
    const held = gate();
    const opened = await openView(log, [repository.root], {
      ready: false,
      watched: true,
    });
    stubMethod(opened.view, 'startWatching', async () => {
      await started.opened;
      return { dispose: () => held.opened };
    });
    const ready = opened.connection.receive({ type: 'ready' });
    await waitFor(
      () => opened.page.last('commits') !== undefined,
      'the history',
    );
    opened.connection.dispose();
    started.open();
    await ready;
    await idleOnlyOnceOpened(opened.view, held);
  });
});

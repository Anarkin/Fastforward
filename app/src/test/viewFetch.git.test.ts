import * as assert from 'node:assert';
import * as fs from 'node:fs';
import { createServer } from 'node:http';
import * as path from 'node:path';
import type { Connection } from '../view';
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
  lockedRepository,
  openView,
  stubMethod,
  takeErrorsLogged,
  withNotices,
} from './viewHarness';

suite('View fetching', function () {
  this.timeout(30_000);

  let folder: string;
  let repository: TempRepository;
  let remote: TempRepository;
  let page: FakePage;
  let connection: Connection;

  const { log, error: logged } = recordingLog();
  failOnErrorsLogged(logged);
  const interactive = process.env.GCM_INTERACTIVE;

  function takeFetchFailures(reason: RegExp): void {
    takeErrorsLogged(
      logged,
      /^fetch failed$/,
      new RegExp(`^git fetch --all --prune failed: fatal: ${reason.source}`),
    );
  }

  suiteSetup(async () => {
    delete process.env.GCM_INTERACTIVE;
    folder = tempFolder('fetch');
    repository = await tempRepository(path.join(folder, 'local'));
    await repository.commit('a');
    remote = await tempRepository(path.join(folder, 'remote'), {
      bare: true,
    });
    await repository.git('remote', 'add', 'origin', remote.root);
    await repository.git('push', '-u', 'origin', 'main');
    ({ page, connection } = await openView(log, [repository.root]));
  });

  suiteTeardown(async () => {
    if (interactive !== undefined) {
      process.env.GCM_INTERACTIVE = interactive;
    }
    await closeViews();
    removeFolder(folder);
  });

  test('fetches every remote, dropping branches deleted there', async () => {
    const upstream = await tempRepository(path.join(folder, 'upstream'), {
      bare: true,
    });
    await repository.git('remote', 'add', 'upstream', upstream.root);
    try {
      await repository.git('push', upstream.root, 'main:upstream-only');
      await remote.git('branch', 'short-lived', 'main');
      await connection.receive({ type: 'fetch', root: repository.root });
      const fetched =
        page.last('repository')?.refs.map((ref) => ref.name) ?? [];
      assert.ok(fetched.includes('origin/short-lived'));
      assert.ok(fetched.includes('upstream/upstream-only'));
      await remote.git('branch', '-D', 'short-lived');
      await connection.receive({ type: 'fetch', root: repository.root });
      assert.ok(
        page
          .last('repository')
          ?.refs.every((ref) => ref.name !== 'origin/short-lived'),
      );
      assert.strictEqual(page.last('fetching')?.running, false);
    } finally {
      await repository.git('remote', 'remove', 'upstream');
    }
  });

  test('says when a fetch asked for fails, even while a background fetch that keeps quiet runs', async () => {
    const failing = await tempRepository(path.join(folder, 'failing'));
    await failing.commit('a');
    await failing.git('remote', 'add', 'origin', path.join(folder, 'absent'));
    const rounds: (() => void)[] = [];
    const opened = await openView(
      log,
      [failing.root],
      true,
      undefined,
      (run) => {
        rounds.push(run);
        return () => undefined;
      },
    );
    let asked: Promise<void> | undefined;
    stubMethod(opened.view, 'fetchRemotes', (original, ...args) => {
      const fetched = original(...args);
      if (rounds.length === 1 && args[3] === false) {
        asked ??= opened.connection.receive({
          type: 'fetch',
          root: failing.root,
        });
      }
      return fetched;
    });
    try {
      await withNotices(opened.page, 'error', async (messages) => {
        await opened.connection.receive({ type: 'setAutoFetch', on: true });
        await waitFor(() => rounds.length === 1, 'the first round');
        assert.strictEqual(messages.length, 1);
        rounds[0]();
        await waitFor(() => rounds.length === 2, 'the second round');
        await asked;
        assert.strictEqual(messages.length, 2);
        assert.match(messages[1] ?? '', /^Couldn't fetch./);
      });
      takeFetchFailures(/'.*' does not appear to be a git repository/);
    } finally {
      opened.connection.dispose();
    }
  });

  test('says a fetch asked for failed after its tab was left, naming its repository', async () => {
    const left = await tempRepository(path.join(folder, 'left'));
    await left.commit('a');
    await left.git('remote', 'add', 'origin', path.join(folder, 'nowhere'));
    const opened = await openView(log, [left.root, repository.root]);
    stubMethod(opened.view, 'fetchRemotes', async (original, ...args) => {
      await opened.connection.receive({
        type: 'selectTab',
        root: repository.root,
      });
      return original(...args);
    });
    try {
      await withNotices(opened.page, 'error', async (messages) => {
        await opened.connection.receive({ type: 'fetch', root: left.root });
        assert.strictEqual(messages.length, 1);
        assert.match(messages[0] ?? '', /^left: Couldn't fetch\./);
      });
      takeFetchFailures(/'.*' does not appear to be a git repository/);
    } finally {
      opened.connection.dispose();
    }
  });

  test('lets only a fetch asked for, not one in the background, ask for credentials', async () => {
    const {
      repository: locked,
      asked,
      close,
    } = await lockedRepository(path.join(folder, 'locked'));
    const rounds: (() => void)[] = [];
    const opened = await openView(
      log,
      [locked.root],
      true,
      undefined,
      (run) => {
        rounds.push(run);
        return () => undefined;
      },
    );
    try {
      await opened.connection.receive({ type: 'setAutoFetch', on: true });
      await waitFor(() => rounds.length === 1, 'the round to end');
      await opened.connection.receive({ type: 'fetch', root: locked.root });
      assert.deepStrictEqual(asked(), ['[never]', '[]']);
      takeFetchFailures(/Authentication failed/);
    } finally {
      opened.connection.dispose();
      await close();
    }
  });

  test('lets only a fetch asked for, not one in the background, ask for credentials with a program the user set, in any of the ways git takes one', async () => {
    let requests = 0;
    const server = createServer((_request, response) => {
      requests++;
      response.writeHead(401, { 'WWW-Authenticate': 'Basic realm="locked"' });
      response.end();
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const address = server.address();
    assert.ok(typeof address === 'object' && address !== null);
    const { port } = address;
    const variables = ['GIT_ASKPASS', 'SSH_ASKPASS'];
    const previous = variables.map(
      (name) => [name, process.env[name]] as const,
    );
    try {
      for (const way of ['GIT_ASKPASS', 'core.askPass', 'SSH_ASKPASS']) {
        const locked = await tempRepository(path.join(folder, `asks-${way}`));
        await locked.commit('a');
        await locked.git(
          'remote',
          'add',
          'origin',
          `http://127.0.0.1:${port}/x`,
        );
        await locked.git('config', 'credential.helper', '');
        const asked = path.join(folder, `asked-${way}`).replaceAll('\\', '/');
        const askpass = path
          .join(folder, `askpass-${way}.sh`)
          .replaceAll('\\', '/');
        fs.writeFileSync(
          askpass,
          `#!/bin/sh\necho "$1" >> '${asked}'\necho x\n`,
          { mode: 0o755 },
        );
        for (const name of variables) {
          delete process.env[name];
        }
        if (way === 'core.askPass') {
          await locked.git('config', way, askpass);
        } else {
          process.env[way] = askpass;
        }
        const rounds: (() => void)[] = [];
        const opened = await openView(
          log,
          [locked.root],
          true,
          undefined,
          (run) => {
            rounds.push(run);
            return () => undefined;
          },
        );
        try {
          requests = 0;
          await opened.connection.receive({ type: 'setAutoFetch', on: true });
          await waitFor(() => rounds.length === 1, 'the round to end');
          assert.ok(requests > 0, way);
          assert.strictEqual(fs.existsSync(asked), false, way);
          await opened.connection.receive({ type: 'fetch', root: locked.root });
          assert.match(fs.readFileSync(asked, 'utf8'), /^Username/, way);
          takeErrorsLogged(
            logged,
            /^fetch failed$/,
            /^git fetch --all --prune failed: fatal: could not read Username for '.*': terminal prompts disabled/,
            /^git fetch --all --prune failed: fatal: Authentication failed/,
          );
        } finally {
          opened.connection.dispose();
        }
      }
    } finally {
      for (const [name, value] of previous) {
        if (value === undefined) {
          delete process.env[name];
        } else {
          process.env[name] = value;
        }
      }
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test('lets a fetch asked for while a background one runs ask for credentials, and says it failed once', async () => {
    const {
      repository: locked,
      asked,
      close,
    } = await lockedRepository(path.join(folder, 'joined'));
    const rounds: (() => void)[] = [];
    const opened = await openView(
      log,
      [locked.root],
      true,
      undefined,
      (run) => {
        rounds.push(run);
        return () => undefined;
      },
    );
    let manual: Promise<void> | undefined;
    stubMethod(opened.view, 'fetchRemotes', (original, ...args) => {
      const fetched = original(...args);
      if (args[3] === false) {
        manual ??= opened.connection.receive({
          type: 'fetch',
          root: locked.root,
        });
      }
      return fetched;
    });
    try {
      await withNotices(opened.page, 'error', async (messages) => {
        await opened.connection.receive({ type: 'setAutoFetch', on: true });
        await waitFor(() => rounds.length === 1, 'the round to end');
        await manual;
        assert.deepStrictEqual(asked(), ['[never]', '[]']);
        assert.strictEqual(messages.length, 1);
        assert.match(messages[0] ?? '', /^Couldn't fetch\./);
      });
      takeFetchFailures(/Authentication failed/);
    } finally {
      opened.connection.dispose();
      await close();
    }
  });

  test('says once that a fetch failed when a background one joins it', async () => {
    const { repository: locked, close } = await lockedRepository(
      path.join(folder, 'joining'),
    );
    const rounds: (() => void)[] = [];
    const opened = await openView(
      log,
      [locked.root],
      true,
      undefined,
      (run) => {
        rounds.push(run);
        return () => undefined;
      },
    );
    let background: Promise<void> | undefined;
    stubMethod(opened.view, 'fetchRemotes', (original, ...args) => {
      const fetched = original(...args);
      if (args[3] !== false) {
        background ??= opened.connection.receive({
          type: 'setAutoFetch',
          on: true,
        });
      }
      return fetched;
    });
    try {
      await withNotices(opened.page, 'error', async (messages) => {
        await opened.connection.receive({ type: 'fetch', root: locked.root });
        await background;
        await waitFor(() => rounds.length === 1, 'the round to end');
        assert.strictEqual(messages.length, 1);
        assert.match(messages[0] ?? '', /^Couldn't fetch\./);
      });
      takeFetchFailures(/Authentication failed/);
    } finally {
      opened.connection.dispose();
      await close();
    }
  });

  test('says so when a fetch fails, and stops fetching', async () => {
    await repository.git(
      'remote',
      'add',
      'broken',
      path.join(folder, 'missing'),
    );
    try {
      await withNotices(page, 'error', async (messages) => {
        page.clear();
        await connection.receive({ type: 'fetch', root: repository.root });
        assert.strictEqual(messages.length, 1);
        assert.match(messages[0] ?? '', /^Couldn't fetch\./);
        assert.strictEqual(page.last('fetching')?.running, false);
        assert.ok(page.last('workingTree'));
      });
      takeFetchFailures(/'.*' does not appear to be a git repository/);
    } finally {
      await repository.git('remote', 'remove', 'broken');
    }
  });
});

import * as assert from 'node:assert';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, suite, test } from 'vitest';
import { activeTabKey } from '../storage';
import { strings } from '../shared/strings';
import { tabInfos, tabName } from '../view';
import { waitFor } from './fixtures';
import { recordingLog } from './stub';
import type { CommandInstall } from '../main/terminalCommand';
import {
  closeViews,
  failOnErrorsLogged,
  FakeHost,
  openView,
  stubMethod,
  takeErrorsLogged,
  withView,
  type FakePage,
} from './viewHarness';

function noticesOf(page: FakePage): (readonly [string, string])[] {
  return page.messages.flatMap((message) =>
    message.type === 'notice'
      ? [[message.level, message.message] as const]
      : [],
  );
}

function foldersOf(roots: string[], paths = path.posix) {
  return tabInfos(roots, paths).map((tab) => tab.folder);
}

suite('View', () => {
  const folder = os.tmpdir();

  test('names a tab after its folder, or after the whole root of a repository at the top of a drive', () => {
    assert.strictEqual(tabName(path.join(folder, 'main')), 'main');
    const top = path.parse(folder).root;
    assert.strictEqual(tabName(top), top);
  });

  test('names a bare repository after its folder without .git, or after the folder holding it', () => {
    assert.strictEqual(tabName(path.join(folder, 'app.git')), 'app');
    assert.strictEqual(tabName(path.join(folder, 'app', '.bare')), 'app');
    assert.strictEqual(tabName(path.join(folder, 'app', '.git')), 'app');
  });

  test('tells tabs named the same apart by the nearest folder above them that differs, leaving the others be', () => {
    assert.deepStrictEqual(
      foldersOf(['/code/site', '/code/x/site', '/code/app']),
      ['code', 'x', undefined],
    );
    assert.deepStrictEqual(
      foldersOf(['/work/a/shop/app', '/work/b/shop/app']),
      ['a', 'b'],
    );
  });

  test('names every folder that tells a tab apart from the others named the same, marking those it skips', () => {
    assert.deepStrictEqual(foldersOf(['/a/x/app', '/b/x/app', '/a/y/app']), [
      'a/x',
      'b/x',
      'y',
    ]);
    assert.deepStrictEqual(
      foldersOf(['/a/s/x/app', '/b/s/x/app', '/a/s/y/app']),
      ['a/…/x', 'b/…/x', 'y'],
    );
  });

  test('tells repositories apart from the folder holding them, whether bare or not', () => {
    assert.deepStrictEqual(
      foldersOf(['/a/app/.git', '/b/app.git', '/c/app/.bare']),
      ['a', 'b', 'c'],
    );
  });

  test('ignores case on Windows, and names the drive when nothing else differs', () => {
    assert.deepStrictEqual(
      foldersOf(['C:\\One\\Code\\App', 'c:\\Two\\code\\app'], path.win32),
      ['One', 'Two'],
    );
    assert.deepStrictEqual(
      foldersOf(['C:\\Code\\app', 'D:\\Code\\app'], path.win32),
      ['C:\\', 'D:\\'],
    );
    assert.deepStrictEqual(
      foldersOf(['C:\\x\\app', 'D:\\x\\app', 'C:\\y\\app'], path.win32),
      ['C:\\x', 'D:\\x', 'y'],
    );
  });

  test('labels a tab with the folder that tells it apart', () => {
    assert.strictEqual(strings.tabs.label('app', 'x'), 'app (x)');
    assert.strictEqual(strings.tabs.label('app'), 'app');
  });
});

suite('View with no tab open', () => {
  const noGit = path.join(os.tmpdir(), 'fastforward-no-git');

  const { log, error: logged } = recordingLog();
  failOnErrorsLogged(logged);

  afterAll(closeViews);

  test('opens the settings files through the app', async () => {
    const host = new FakeHost();
    await withView(
      log,
      [],
      async (view) => {
        await view.connection.receive({ type: 'openSettings' });
        await view.connection.receive({ type: 'openDefaultSettings' });
        assert.deepStrictEqual(host.opened, ['settings', 'defaults']);
      },
      false,
      host,
      noGit,
    );
  });

  test('says what is wrong with the settings when the page loads', async () => {
    const host = new FakeHost();
    host.problems = ['Unknown setting "sollo"'];
    await withView(
      log,
      [],
      async (view) => {
        assert.deepStrictEqual(view.page.last('notice'), {
          type: 'notice',
          level: 'error',
          message: 'Settings: Unknown setting "sollo"',
        });
      },
      true,
      host,
      noGit,
    );
  });

  test('leaves updating to the app, sending how far it got when the page loads', async () => {
    const host = new FakeHost();
    host.update = { kind: 'ready', version: '7.0.0' };
    await withView(
      log,
      [],
      async (view) => {
        assert.deepStrictEqual(view.page.last('update'), {
          type: 'update',
          status: { kind: 'ready', version: '7.0.0' },
        });
        await view.connection.receive({ type: 'checkForUpdates' });
        await view.connection.receive({ type: 'installUpdate' });
        assert.deepStrictEqual(host.opened, ['update check', 'update install']);
      },
      true,
      host,
      noGit,
    );
  });

  test('tells the page whether it can install ff, which only the app on macOS and an AppImage do, leaving it to the installer on Windows and the package on Linux', async () => {
    for (const installable of [false, true]) {
      const host = new FakeHost();
      host.commandPlace = installable;
      host.command = 'installed';
      await withView(
        log,
        [],
        async (view) => {
          assert.deepStrictEqual(view.page.last('terminalCommand'), {
            type: 'terminalCommand',
            installable,
          });
        },
        true,
        host,
        noGit,
      );
    }
  });

  test('offers ff once, in a notice, where the app installs it and it is not installed, as an update brings it to copies of the app no installer sets up', async () => {
    const host = new FakeHost();
    host.commandPlace = true;
    await withView(
      log,
      [],
      async (view) => {
        assert.deepStrictEqual(noticesOf(view.page), [
          ['info', strings.messages.offerCommand],
        ]);
        view.page.clear();
        await view.connection.receive({ type: 'ready' });
        await view.view.idle();
        assert.deepStrictEqual(noticesOf(view.page), []);
      },
      true,
      host,
      noGit,
    );
  });

  test('offers no ff that is installed, or that another ff stands in the way of', async () => {
    for (const command of ['installed', 'outdated', 'taken'] as const) {
      const host = new FakeHost();
      host.commandPlace = true;
      host.command = command;
      await withView(
        log,
        [],
        async (view) => {
          assert.deepStrictEqual(noticesOf(view.page), [], command);
        },
        true,
        host,
        noGit,
      );
    }
  });

  test('installs ff on asking, saying where it went, or why not', async () => {
    const file = '/usr/local/bin/ff';
    const outcomes: [CommandInstall, ...(readonly [string, string])[]][] = [
      [
        { kind: 'installed', path: file, onPath: true },
        ['info', strings.messages.commandInstalled(file)],
      ],
      [
        { kind: 'installed', path: file, onPath: false },
        ['info', strings.messages.commandOffPath(file, '/usr/local/bin')],
      ],
      [
        { kind: 'alreadyInstalled', path: file },
        ['info', strings.messages.commandAlreadyInstalled(file)],
      ],
      [
        { kind: 'taken', path: file },
        ['error', strings.messages.commandTaken(file)],
      ],
      [{ kind: 'notMoved' }, ['error', strings.messages.commandNotMoved]],
      [{ kind: 'cancelled' }],
    ];
    for (const [installed, ...notices] of outcomes) {
      const host = new FakeHost();
      host.commandPlace = true;
      host.command = 'installed';
      host.installs = installed;
      await withView(
        log,
        [],
        async (view) => {
          await view.connection.receive({ type: 'installTerminalCommand' });
          assert.deepStrictEqual(noticesOf(view.page), notices, installed.kind);
        },
        true,
        host,
        noGit,
      );
    }
  });

  test('says why ff could not be installed, logging the error', async () => {
    const host = new FakeHost();
    host.commandPlace = true;
    host.command = 'installed';
    host.installs = new Error('Read-only file system');
    await withView(
      log,
      [],
      async (view) => {
        await view.connection.receive({ type: 'installTerminalCommand' });
        assert.deepStrictEqual(noticesOf(view.page), [
          [
            'error',
            strings.messages.couldNotInstallCommand('Read-only file system'),
          ],
        ]);
        takeErrorsLogged(
          logged,
          /^Installing the ff command failed$/,
          /^Read-only file system$/,
        );
      },
      true,
      host,
      noGit,
    );
  });

  test('installs no ff where the app leaves it to an installer, whatever the page asks', async () => {
    const host = new FakeHost();
    await withView(
      log,
      [],
      async (view) => {
        await view.connection.receive({ type: 'installTerminalCommand' });
        assert.deepStrictEqual(host.opened, []);
        assert.deepStrictEqual(noticesOf(view.page), []);
      },
      true,
      host,
      noGit,
    );
  });

  test('sends the version of the app and of git when the page loads, for its About, and copies what the page asks to', async () => {
    const host = new FakeHost();
    await withView(
      log,
      [],
      async (view) => {
        assert.deepStrictEqual(view.page.last('about'), {
          type: 'about',
          version: '1.2.3',
          development: true,
          git: '2.52.0',
          system: 'Windows 11, build 26300, x64',
        });
        await view.connection.receive({ type: 'copyText', text: 'copied' });
        assert.deepStrictEqual(host.opened, ['copy copied']);
      },
      true,
      host,
      noGit,
    );
  });

  test('saves the layout and sends it when the page loads', async () => {
    await withView(
      log,
      [],
      async (view) => {
        await view.connection.receive({
          type: 'setColumnWidths',
          widths: [400, 250],
        });
        await view.connection.receive({ type: 'setShowAllFiles', show: true });
        await view.connection.receive({ type: 'ready' });
        const layout = view.page.last('layout');
        assert.deepStrictEqual(layout?.columnWidths, [400, 250]);
        assert.strictEqual(layout.showAllFiles, true);
      },
      true,
      undefined,
      noGit,
    );
  });

  test('saves the merge setting with no tab open', async () => {
    await withView(
      log,
      [],
      async (own) => {
        await own.connection.receive({
          type: 'setCollapseMerges',
          collapse: false,
        });
        assert.strictEqual(own.settings.settings.collapseMerges, false);
      },
      false,
      undefined,
      noGit,
    );
  });
});

suite('View fetching by itself', () => {
  const noGit = path.join(os.tmpdir(), 'fastforward-no-git');

  const { log, error: logged } = recordingLog();
  failOnErrorsLogged(logged);

  afterAll(closeViews);

  test('fetches the active repository first, then the rest in tab order', async () => {
    const [first, second, third] = ['first', 'second', 'third'].map((name) =>
      path.join(os.tmpdir(), `fastforward-${name}`),
    );
    const own = await openView(
      log,
      [first, second, third],
      false,
      undefined,
      () => () => undefined,
      noGit,
    );
    await own.store.update(activeTabKey, second);
    const fetched: unknown[] = [];
    stubMethod(own.view, 'fetchInBackground', (_original, root) => {
      fetched.push(root);
      return Promise.resolve();
    });
    await own.connection.receive({ type: 'setAutoFetch', on: true });
    await waitFor(() => fetched.length === 3, 'a round of fetches');
    assert.deepStrictEqual(fetched, [second, first, third]);
  });
});

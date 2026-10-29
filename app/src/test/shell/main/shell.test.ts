import * as assert from 'node:assert';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, suite, test } from 'vitest';
import { strings } from '../../../shared/strings';
import { recordingLog } from '../../stub';
import type { CommandInstall } from '../../../main/terminalCommand';
import {
  closeViews,
  failOnErrorsLogged,
  FakeHost,
  gate,
  stubMethod,
  takeErrorsLogged,
  withView,
  type FakePage,
} from '../../harness';
import { removeFolder, tempFolder } from '../../repositories';

function noticesOf(page: FakePage): (readonly [string, string])[] {
  return page.messages.flatMap((message) =>
    message.type === 'notice'
      ? [[message.level, message.message] as const]
      : [],
  );
}

suite('Shell with no tab open', () => {
  const noGit = path.join(os.tmpdir(), 'fastforward-no-git');

  const { log, info, warn: warned, error: logged } = recordingLog();
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

  test('says on the page why the app could not do what the page asked, as well as in the log', async () => {
    const host = new FakeHost();
    host.openSettings = () =>
      Promise.reject(new Error('no editor opens settings.user.json'));
    await withView(
      log,
      [],
      async (view) => {
        await view.connection.receive({ type: 'openSettings' });
        assert.deepStrictEqual(noticesOf(view.page), [
          ['error', 'no editor opens settings.user.json'],
        ]);
        takeErrorsLogged(
          logged,
          /^Handling openSettings from the page failed$/,
          /^no editor opens settings\.user\.json$/,
        );
      },
      false,
      host,
      noGit,
    );
  });

  test('leaves the tools not shown alone when it switches between tabs of another tool, telling the page only the tabs', async () => {
    await withView(
      log,
      [],
      async (view) => {
        await view.connection.receive({ type: 'newTab', tool: 'files' });
        await view.connection.receive({ type: 'newTab', tool: 'files' });
        const [first] = view.page.tabs?.tabs ?? [];
        assert.ok(first);
        view.page.clear();
        await view.connection.receive({ type: 'selectTab', tab: first.id });
        assert.deepStrictEqual(
          view.page.messages.map((message) => message.type),
          ['tabs'],
        );
      },
      true,
      undefined,
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

  test('checks the kind of each value the page sends before acting on it, as the page is not trusted', async () => {
    const host = new FakeHost();
    await withView(
      log,
      [],
      async (view) => {
        await view.connection.receive({ type: 'newTab', tool: 'terminal' });
        await view.connection.receive({ type: 'newTab', tool: 'files' });
        const lines = info.length;
        const warnings = warned.length;
        for (const message of [
          '{ "type": "setAutoSortTabs", "on": "yes" }',
          '{ "type": "copyText", "text": 5 }',
          '{ "type": "log", "level": "warn", "message": "forged" }',
          '{ "type": "log", "level": "info", "message": { "forged": true } }',
        ]) {
          await view.connection.receive(JSON.parse(message));
        }
        assert.deepStrictEqual(
          view.page.tabs?.tabs.map((tab) => tab.tool),
          ['terminal', 'files'],
        );
        assert.strictEqual(view.settings.settings.autoSortTabs, false);
        assert.deepStrictEqual(host.opened, []);
        assert.strictEqual(warned.length, warnings);
        assert.ok(
          !info
            .slice(lines)
            .some((line) => line.startsWith(strings.log.webview(''))),
        );
        await view.connection.receive({
          type: 'log',
          level: 'info',
          message: 'shown',
        });
        assert.strictEqual(info.at(-1), strings.log.webview('shown'));
      },
      true,
      host,
      noGit,
    );
  });

  test('sorts the tabs as the page loads once auto-sort is turned on in the settings file, as the page then offers neither sorting nor dragging them', async () => {
    await withView(
      log,
      [],
      async (view) => {
        await view.connection.receive({ type: 'newTab', tool: 'terminal' });
        await view.connection.receive({ type: 'newTab', tool: 'files' });
        await view.settings.set('autoSortTabs', true);
        view.shell.reloadSettings();
        await view.connection.receive({ type: 'ready' });
        assert.deepStrictEqual(
          view.page.tabs?.tabs.map((tab) => tab.tool),
          ['files', 'terminal'],
        );
      },
      true,
      undefined,
      noGit,
    );
  });

  test('asks about the folders asked for at about the same time in one question, as Explorer starts the app once for each folder picked, each handing its folder over', async () => {
    const first = tempFolder('first');
    const second = tempFolder('second');
    try {
      await withView(
        log,
        [],
        async (view) => {
          const held = gate();
          stubMethod(view.view, 'fits', async (_fits, folder) => {
            if (folder === first) {
              await held.opened;
            }
            return false;
          });
          const asked = [
            view.shell.openFolders([first]),
            view.shell.openFolders([second]),
          ];
          await new Promise((resolve) => setTimeout(resolve, 50));
          held.open();
          await Promise.all(asked);
          assert.deepStrictEqual(view.page.last('chooseTool')?.folders, [
            first,
            second,
          ]);
          await view.connection.receive({ type: 'openWith', tool: 'files' });
          assert.deepStrictEqual(
            view.page.tabs?.tabs.map((tab) => tab.root),
            [first, second],
          );
        },
        true,
        undefined,
        noGit,
      );
    } finally {
      removeFolder(first);
      removeFolder(second);
    }
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
});

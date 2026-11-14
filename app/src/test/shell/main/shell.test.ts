import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ChangeSet } from '@codemirror/state';
import { afterAll, suite, test } from 'vitest';
import { plainOf, strings, type Sentence } from '../../../lib/shared/strings';
import { recordingLog } from '../../support/stub';
import type { CommandInstall } from '../../../shell/main/hostTypes';
import {
  attach,
  closeViews,
  failOnErrorsLogged,
  FakeHost,
  gate,
  openView,
  shellOf,
  stubMethod,
  takeErrorsLogged,
  terminalHostOf,
  withView,
  type FakePage,
} from '../../support/harness';
import { removeFolder, tempFolder } from '../../support/repositories';
import { quitNoteOf } from '../../../shell/main/shell';
import { tabsKey, windowsKey } from '../../../shell/main/storage';

const saying = (note?: string) => ({ quitNote: () => note });

function noticesOf(page: FakePage): (readonly [string, Sentence])[] {
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

  test('opens the settings files in editor tabs of the app, a file already open in its tab', async () => {
    const host = new FakeHost();
    await withView(
      log,
      [],
      async (view) => {
        await view.connection.receive({ type: 'openSettings' });
        await view.connection.receive({ type: 'openDefaultSettings' });
        await view.connection.receive({ type: 'openSettings' });
        assert.deepStrictEqual(host.opened, [
          'settings',
          'defaults',
          'settings',
        ]);
        assert.deepStrictEqual(
          view.page.tabs?.tabs.map(({ tool, root, edit }) => ({
            tool,
            root,
            edit,
          })),
          [
            {
              tool: 'commander',
              root: path.resolve('settings.user.json'),
              edit: true,
            },
            {
              tool: 'commander',
              root: path.resolve('settings.defaults.json'),
              edit: true,
            },
          ],
        );
        assert.strictEqual(view.page.tabs?.active, view.page.tabs?.tabs[0]?.id);
      },
      false,
      host,
      noGit,
    );
  });

  test('says on the page why the app could not do what the page asked, as well as in the log', async () => {
    const host = new FakeHost();
    host.userSettingsFile = () =>
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
        await view.connection.receive({ type: 'newTab', tool: 'commander' });
        await view.connection.receive({ type: 'newTab', tool: 'commander' });
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

  test('says what was wrong with the saved state when the page loads, as the tabs and recent items it held were gone without a word', async () => {
    const host = new FakeHost();
    host.unsavedState = [strings.state.putAside('state.json.corrupt')];
    await withView(
      log,
      [],
      async (view) => {
        assert.deepStrictEqual(view.page.last('notice'), {
          type: 'notice',
          level: 'error',
          message: strings.state.putAside('state.json.corrupt'),
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

  test('asks before quitting while a tool says quitting would cut its work short, saying what each tool says', () => {
    assert.strictEqual(
      quitNoteOf({ terminal: saying(), commander: saying(), git: saying() }),
      undefined,
    );
    assert.strictEqual(
      quitNoteOf({
        terminal: saying(),
        commander: saying('A copy runs.'),
        git: saying('A clone runs.'),
      }),
      'A copy runs. A clone runs.',
    );
  });

  test('asks the page before quitting while a tab of a tool that confirms closing is open, as closing a Terminal ends its shell, leaving quitting to the app once the page confirms', async () => {
    const host = new FakeHost();
    await withView(
      log,
      [],
      async (view) => {
        const shell = shellOf(view.view);
        assert.strictEqual(shell.asksBeforeQuit(), false);
        await view.connection.receive({ type: 'newTab', tool: 'terminal' });
        assert.strictEqual(shell.asksBeforeQuit(), true);
        shell.askToQuit();
        assert.deepStrictEqual(view.page.last('confirmQuit'), {
          type: 'confirmQuit',
        });
        await view.connection.receive({ type: 'quit' });
        assert.deepStrictEqual(host.opened, ['quit']);
        view.connection.dispose();
        assert.strictEqual(shell.asksBeforeQuit(), false);
      },
      true,
      host,
      noGit,
    );
  });

  test('asks before quitting or closing the window while a file edited in a tab has unsaved changes, naming it, saves it first once told to and quits only once it is saved', async () => {
    const host = new FakeHost();
    const folder = tempFolder('unsaved');
    const file = path.join(folder, 'notes.txt');
    fs.writeFileSync(file, 'one\n');
    host.userSettingsFile = () => Promise.resolve(file);
    try {
      await withView(
        log,
        [],
        async (view) => {
          const shell = shellOf(view.view);
          await view.connection.receive({ type: 'openSettings' });
          const tab =
            view.page.tabs?.tabs.find((each) => each.root === file)?.id ?? '';
          await view.connection.receive({
            type: 'tool',
            tool: 'commander',
            message: { type: 'readEdited', tab },
          });
          assert.strictEqual(shell.asksBeforeQuit(), false);
          await view.connection.receive({
            type: 'tool',
            tool: 'commander',
            message: {
              type: 'editText',
              tab,
              update: {
                version: 0,
                changes: ChangeSet.of({ from: 0, insert: 'x' }, 4).toJSON(),
              },
            },
          });
          assert.strictEqual(
            view.page.tabs?.tabs.find((each) => each.id === tab)?.unsaved,
            true,
          );
          assert.strictEqual(shell.asksBeforeQuit(), true);
          assert.strictEqual(shell.asksBeforeClosing('1'), true);
          shell.askToCloseWindow('1');
          assert.deepStrictEqual(view.page.last('confirmCloseWindow'), {
            type: 'confirmCloseWindow',
            unsaved: ['notes.txt'],
          });
          shell.askToQuit();
          assert.deepStrictEqual(view.page.last('confirmQuit'), {
            type: 'confirmQuit',
            unsaved: ['notes.txt'],
          });
          await view.connection.receive({ type: 'quit', save: true });
          assert.strictEqual(fs.readFileSync(file, 'utf8'), 'xone\n');
          assert.deepStrictEqual(host.opened, ['quit']);
          assert.strictEqual(shell.asksBeforeQuit(), false);
        },
        true,
        host,
        noGit,
      );
    } finally {
      removeFolder(folder);
    }
  });

  test('closes a tab of unsaved changes only once told to save them or not, saving them first when told to', async () => {
    const host = new FakeHost();
    const folder = tempFolder('unsaved');
    const file = path.join(folder, 'notes.txt');
    fs.writeFileSync(file, 'one\n');
    host.userSettingsFile = () => Promise.resolve(file);
    try {
      await withView(
        log,
        [],
        async (view) => {
          const edit = async (tab: string, version: number) => {
            await view.connection.receive({
              type: 'tool',
              tool: 'commander',
              message: { type: 'readEdited', tab },
            });
            await view.connection.receive({
              type: 'tool',
              tool: 'commander',
              message: {
                type: 'editText',
                tab,
                update: {
                  version,
                  changes: ChangeSet.of(
                    { from: 0, insert: '>' },
                    fs.readFileSync(file, 'utf8').length,
                  ).toJSON(),
                },
              },
            });
          };
          const editedTab = () =>
            view.page.tabs?.tabs.find((each) => each.root === file)?.id;
          await view.connection.receive({ type: 'openSettings' });
          await edit(editedTab() ?? '', 0);
          await view.connection.receive({
            type: 'closeTab',
            tab: editedTab() ?? '',
            save: true,
          });
          assert.strictEqual(fs.readFileSync(file, 'utf8'), '>one\n');
          assert.strictEqual(editedTab(), undefined);
          await view.connection.receive({ type: 'openSettings' });
          await edit(editedTab() ?? '', 0);
          await view.connection.receive({
            type: 'closeTab',
            tab: editedTab() ?? '',
          });
          assert.strictEqual(fs.readFileSync(file, 'utf8'), '>one\n');
          assert.strictEqual(editedTab(), undefined);
        },
        true,
        host,
        noGit,
      );
    } finally {
      removeFolder(folder);
    }
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

  test('tells the page the date format of the settings, which every tool writes its dates in', async () => {
    await withView(
      log,
      [],
      async (view) => {
        assert.deepStrictEqual(view.page.last('dateFormat'), {
          type: 'dateFormat',
          format: 'YYYY-MM-DD HH:mm',
        });
      },
      true,
      new FakeHost(),
      noGit,
    );
  });

  test('tells the page how many rows a notch of the mouse wheel scrolls and whether scrolling glides, which every list that scrolls by rows and the terminal follow', async () => {
    await withView(
      log,
      [],
      async (view) => {
        assert.deepStrictEqual(view.page.last('scrolling'), {
          type: 'scrolling',
          wheelRows: 10,
          smooth: false,
        });
      },
      true,
      new FakeHost(),
      noGit,
    );
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
    const outcomes: [CommandInstall, ...(readonly [string, Sentence])[]][] = [
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
        await view.connection.receive({ type: 'newTab', tool: 'commander' });
        const lines = info.length;
        const warnings = warned.length;
        for (const message of [
          '{ "type": "copyText", "text": 5 }',
          '{ "type": "log", "level": "warn", "message": "forged" }',
          '{ "type": "log", "level": "info", "message": { "forged": true } }',
        ]) {
          await view.connection.receive(JSON.parse(message));
        }
        assert.deepStrictEqual(
          view.page.tabs?.tabs.map((tab) => tab.tool),
          ['terminal', 'commander'],
        );
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
        const before = info.length;
        for (const message of ['again', 'again', 'again', 'other', 'again']) {
          await view.connection.receive({
            type: 'log',
            level: 'info',
            message,
          });
        }
        assert.deepStrictEqual(
          info.slice(before),
          ['again', 'other', 'again'].map((message) =>
            strings.log.webview(message),
          ),
        );
      },
      true,
      host,
      noGit,
    );
  });

  test('leaves alone what the page sends that is no object with a kind, as handling it failed and so did saying so, its failure escaping unhandled', async () => {
    await withView(
      log,
      [],
      async (view) => {
        const posted: unknown[] = [];
        const connection = shellOf(view.view).connect('1', (message) =>
          posted.push(message),
        );
        try {
          for (const message of [
            'null',
            '5',
            '"ready"',
            '[]',
            '{ "type": 5 }',
          ]) {
            await connection.receive(JSON.parse(message));
          }
        } finally {
          connection.dispose();
        }
        assert.deepStrictEqual(posted, []);
      },
      true,
      undefined,
      noGit,
    );
  });

  test('keeps a notice of the app told while the page reloads until the page is ready, as one about an update was lost then', async () => {
    await withView(
      log,
      [],
      async (view) => {
        const shell = shellOf(view.view);
        view.connection.dispose();
        shell.notify({ level: 'info', message: 'update ready' });
        const posted: string[] = [];
        const reloaded = shell.connect('1', (message) => {
          if (message.type === 'notice') {
            posted.push(plainOf(message.message));
          }
        });
        try {
          assert.deepStrictEqual(posted, []);
          await reloaded.receive({ type: 'ready' });
          assert.deepStrictEqual(posted, ['update ready']);
        } finally {
          reloaded.dispose();
        }
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
          await view.connection.receive({
            type: 'openWith',
            tool: 'commander',
          });
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

  test('offers the folder of the active tab to the other tools it fits, its own tool shown but not offered, and opens it in the one picked', async () => {
    const work = tempFolder('work');
    try {
      await withView(
        log,
        [],
        async (view) => {
          await view.shell.openFolders([work]);
          await view.connection.receive({
            type: 'openWith',
            tool: 'commander',
          });
          await view.connection.receive({ type: 'openIn' });
          assert.deepStrictEqual(view.page.last('chooseTool'), {
            type: 'chooseTool',
            folders: [work],
            choices: [
              { tool: 'terminal', fits: true },
              { tool: 'commander', fits: false },
              { tool: 'git', fits: false },
            ],
            picked: 'terminal',
          });
          await view.connection.receive({
            type: 'openWith',
            tool: 'commander',
          });
          assert.strictEqual(view.page.tabs?.tabs.length, 1);
          await view.connection.receive({ type: 'openIn' });
          await view.connection.receive({
            type: 'openWith',
            tool: 'terminal',
          });
          assert.deepStrictEqual(
            view.page.tabs?.tabs.map((tab) => [tab.tool, tab.root]),
            [
              ['commander', work],
              ['terminal', work],
            ],
          );
        },
        true,
        undefined,
        noGit,
      );
    } finally {
      removeFolder(work);
    }
  });

  test('says the folder of the active tab cannot be opened when no other tool fits it, offering nothing, as the folder a terminal tells comes from what runs in it, which may name one gone or made up', async () => {
    const work = tempFolder('work');
    try {
      await withView(
        log,
        [],
        async (view) => {
          await view.shell.openFolders([work]);
          await view.connection.receive({
            type: 'openWith',
            tool: 'commander',
          });
          removeFolder(work);
          view.page.clear();
          await view.connection.receive({ type: 'openIn' });
          assert.deepStrictEqual(noticesOf(view.page), [
            ['error', strings.messages.noToolOpens(work)],
          ]);
          assert.strictEqual(view.page.last('chooseTool'), undefined);
        },
        true,
        undefined,
        noGit,
      );
    } finally {
      removeFolder(work);
    }
  });

  test('moves a terminal tab to the folder its shell goes to, naming it after that folder, but leaves it where it is in the row, so a tab never jumps on a cd', async () => {
    await withView(
      log,
      [],
      async (view) => {
        await view.connection.receive({ type: 'newTab', tool: 'commander' });
        await view.connection.receive({ type: 'newTab', tool: 'terminal' });
        const terminal = view.page.tabs?.tabs.find(
          (tab) => tab.tool === 'terminal',
        );
        assert.ok(terminal);
        await view.connection.receive({
          type: 'tool',
          tool: 'terminal',
          message: { type: 'open', tab: terminal.id, columns: 80, rows: 24 },
        });
        const folder = path.join(os.tmpdir(), 'aaa');
        terminalHostOf(view.view).event({
          type: 'folder',
          id: terminal.id,
          folder,
        });
        assert.deepStrictEqual(
          view.page.tabs?.tabs.map((tab) => [tab.name, tab.root]),
          [
            ['Commander', undefined],
            ['aaa', folder],
          ],
        );
      },
      true,
      undefined,
      noGit,
    );
  });

  test('says when the active tab does not know its folder, as a terminal whose shell has not told it', async () => {
    await withView(
      log,
      [],
      async (view) => {
        await view.connection.receive({ type: 'openIn' });
        assert.deepStrictEqual(noticesOf(view.page), []);
        await view.connection.receive({ type: 'newTab', tool: 'terminal' });
        await view.connection.receive({ type: 'openIn' });
        assert.deepStrictEqual(noticesOf(view.page), [
          ['info', strings.messages.noFolder(strings.tools.terminal)],
        ]);
        assert.strictEqual(view.page.last('chooseTool'), undefined);
      },
      true,
      undefined,
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
});

const commanderTab = (id: string) => ({ id, tool: 'commander' }) as const;

const savedIds = (saved: unknown) =>
  Array.isArray(saved)
    ? saved.flatMap((tab: unknown) =>
        typeof tab === 'object' && tab !== null && 'id' in tab ? [tab.id] : [],
      )
    : [];

const windowsListed = (page: FakePage) =>
  page.messages.flatMap((message) =>
    message.type === 'windows' ? [message.windows] : [],
  );

const shownIn = (page: FakePage) => [
  page.tabs?.tabs.map((tab) => tab.id),
  page.tabs?.active,
];

suite('Shell with several windows', () => {
  const noGit = path.join(os.tmpdir(), 'fastforward-no-git');

  const { log, error: logged } = recordingLog();
  failOnErrorsLogged(logged);

  afterAll(closeViews);

  async function twoWindows(host = new FakeHost()) {
    const first = await openView(log, [], false, host, undefined, noGit);
    await first.store.update(
      tabsKey,
      ['1', '5', '2', '3', '4'].map(commanderTab),
    );
    await first.store.update(windowsKey, [
      { id: '1', tabs: ['1', '5'], active: '1' },
      { id: '2', tabs: ['2', '3', '4'], active: '4' },
    ]);
    const second = attach(first.view, '2');
    await first.connection.receive({ type: 'ready' });
    await second.connection.receive({ type: 'ready' });
    return { first, second };
  }

  test('tells each window its own tabs and the one active in it', async () => {
    const { first, second } = await twoWindows();
    assert.deepStrictEqual(shownIn(first.page), [['1', '5'], '1']);
    assert.deepStrictEqual(shownIn(second.page), [['2', '3', '4'], '4']);
  });

  test('opens a new tab in the window whose page asked for it', async () => {
    const { first, second } = await twoWindows();
    await second.connection.receive({ type: 'newTab', tool: 'commander' });
    assert.deepStrictEqual(shownIn(second.page), [['2', '3', '4', '6'], '6']);
    assert.deepStrictEqual(shownIn(first.page), [['1', '5'], '1']);
  });

  test('opens a new window with no tab beside the one whose page asks for it, keeping it among the windows', async () => {
    const host = new FakeHost();
    const { first, second } = await twoWindows(host);
    await second.connection.receive({ type: 'newWindow' });
    assert.deepStrictEqual(host.opened, ['open window 3 near 2']);
    assert.deepStrictEqual(first.shell.windows(), ['1', '2', '3']);
    const third = attach(first.view, '3');
    await third.connection.receive({ type: 'ready' });
    assert.deepStrictEqual(shownIn(third.page), [[], undefined]);
  });

  test('closes a window and its tabs while another window is open', async () => {
    const { first } = await twoWindows();
    first.shell.closeWindow('2');
    assert.deepStrictEqual(first.shell.windows(), ['1']);
    assert.deepStrictEqual(savedIds(first.store.get(tabsKey)), ['1', '5']);
  });

  test('closes a window once its last tab closes while another window is open, as it stayed open showing no tab, and no tab could open in it again', async () => {
    const host = new FakeHost();
    const { first, second } = await twoWindows(host);
    for (const tab of ['2', '3', '4']) {
      await second.connection.receive({ type: 'closeTab', tab });
    }
    assert.deepStrictEqual(host.opened, ['close window 2']);
    assert.deepStrictEqual(first.shell.windows(), ['1']);
    assert.deepStrictEqual(windowsListed(first.page).at(-1), []);
  });

  test('lets go of the page of a window closed, or of one kept ready for a tab torn off, once it is gone, as every window torn off and closed in a long run was held for good', async () => {
    const { first, second } = await twoWindows();
    const spare = attach(first.view, 's1');
    await spare.connection.receive({ type: 'ready' });
    first.shell.closeWindow('2');
    second.connection.dispose();
    spare.connection.dispose();
    first.connection.dispose();
    const pages: unknown = Reflect.get(first.shell, 'pages');
    assert.ok(pages instanceof Map);
    assert.deepStrictEqual([...pages.keys()], ['1']);
  });

  test('never closes the last window, as quitting keeps its tabs for the next start', async () => {
    const { first } = await twoWindows();
    first.shell.closeWindow('2');
    first.shell.closeWindow('1');
    assert.deepStrictEqual(first.shell.windows(), ['1']);
    assert.deepStrictEqual(shownIn(first.page), [['1', '5'], '1']);
  });

  test('asks the page of a window before closing it while it holds a tab of a tool that confirms closing, as closing a Terminal ends its shell, and leaves closing it to the app once the page confirms', async () => {
    const host = new FakeHost();
    const { first, second } = await twoWindows(host);
    assert.strictEqual(first.shell.asksBeforeClosing('2'), false);
    await second.connection.receive({ type: 'newTab', tool: 'terminal' });
    assert.strictEqual(first.shell.asksBeforeClosing('2'), true);
    assert.strictEqual(first.shell.asksBeforeClosing('1'), false);

    assert.strictEqual(first.shell.askToCloseWindow('2'), true);
    assert.deepStrictEqual(second.page.last('confirmCloseWindow'), {
      type: 'confirmCloseWindow',
    });
    assert.strictEqual(first.page.last('confirmCloseWindow'), undefined);
    await second.connection.receive({ type: 'closeWindow' });
    assert.deepStrictEqual(host.opened, ['close window 2']);
  });

  test('asks before quitting in a window still open once the window in front closed, as the question went to the page of the window closed, and quitting did nothing', async () => {
    const { first, second } = await twoWindows();
    first.shell.focus('2');
    first.shell.closeWindow('2');
    second.connection.dispose();
    first.shell.askToQuit();
    assert.deepStrictEqual(first.page.last('confirmQuit'), {
      type: 'confirmQuit',
    });
  });

  test('selects, moves and closes only the tabs of the window whose page asks, as the page is not trusted', async () => {
    const { first } = await twoWindows();
    await first.connection.receive({ type: 'selectTab', tab: '2' });
    await first.connection.receive({ type: 'moveTab', tab: '3', index: 0 });
    await first.connection.receive({ type: 'closeTab', tab: '4' });
    assert.deepStrictEqual(shownIn(first.page), [['1', '5'], '1']);
    assert.deepStrictEqual(first.store.get(windowsKey), [
      { id: '1', tabs: ['1', '5'], active: '1' },
      { id: '2', tabs: ['2', '3', '4'], active: '4' },
    ]);
  });

  test('shows the tab shown before in the same window once its active tab closes, passing over those shown since in another window', async () => {
    const { first, second } = await twoWindows();
    await second.connection.receive({ type: 'selectTab', tab: '2' });
    await first.connection.receive({ type: 'selectTab', tab: '5' });
    await first.connection.receive({ type: 'selectTab', tab: '1' });
    await second.connection.receive({ type: 'selectTab', tab: '4' });
    await second.connection.receive({ type: 'closeTab', tab: '4' });
    assert.deepStrictEqual(shownIn(second.page), [['2', '3'], '2']);
    assert.deepStrictEqual(shownIn(first.page), [['1', '5'], '1']);
  });

  test('moves a tab to a new window beside the one it leaves, showing it there and in the window it left the tab shown before it', async () => {
    const host = new FakeHost();
    const { first } = await twoWindows(host);
    await first.connection.receive({ type: 'selectTab', tab: '5' });
    await first.connection.receive({ type: 'selectTab', tab: '1' });
    await first.connection.receive({ type: 'moveTabToWindow', tab: '1' });
    assert.deepStrictEqual(host.opened, ['open window 3 near 1']);
    assert.deepStrictEqual(shownIn(first.page), [['5'], '5']);
    assert.deepStrictEqual(first.store.get(windowsKey), [
      { id: '1', tabs: ['5'], active: '5' },
      { id: '2', tabs: ['2', '3', '4'], active: '4' },
      { id: '3', tabs: ['1'], active: '1' },
    ]);
  });

  test('moves a tab into another window at its end, showing it there and bringing that window to the front', async () => {
    const host = new FakeHost();
    const { first, second } = await twoWindows(host);
    await second.connection.receive({
      type: 'moveTabToWindow',
      tab: '3',
      window: '1',
    });
    assert.deepStrictEqual(host.opened, ['show window 1']);
    assert.deepStrictEqual(shownIn(first.page), [['1', '5', '3'], '3']);
    assert.deepStrictEqual(shownIn(second.page), [['2', '4'], '4']);
  });

  test('closes the window whose only tab moves into another', async () => {
    const host = new FakeHost();
    const { first, second } = await twoWindows(host);
    await first.connection.receive({
      type: 'moveTabToWindow',
      tab: '5',
      window: '2',
    });
    await first.connection.receive({
      type: 'moveTabToWindow',
      tab: '1',
      window: '2',
    });
    assert.deepStrictEqual(host.opened, [
      'show window 2',
      'show window 2',
      'close window 1',
    ]);
    assert.deepStrictEqual(first.shell.windows(), ['2']);
    assert.deepStrictEqual(shownIn(second.page), [
      ['2', '3', '4', '5', '1'],
      '1',
    ]);
  });

  test('moves no tab of another window, nor into a window that is gone or its own, nor the only tab of a window into a new one, as the page is not trusted', async () => {
    const host = new FakeHost();
    const { first } = await twoWindows(host);
    const layout = first.store.get(windowsKey);
    for (const move of [
      { tab: '2' },
      { tab: '2', window: '1' },
      { tab: '1', window: '9' },
      { tab: '1', window: '1' },
    ]) {
      await first.connection.receive({ type: 'moveTabToWindow', ...move });
    }
    assert.deepStrictEqual(first.store.get(windowsKey), layout);
    await first.connection.receive({ type: 'closeTab', tab: '5' });
    await first.connection.receive({ type: 'moveTabToWindow', tab: '1' });
    assert.deepStrictEqual(host.opened, []);
    assert.deepStrictEqual(first.shell.windows(), ['1', '2']);
  });

  test('tells each window the others, named after the tab each shows, again only once they change', async () => {
    const { first, second } = await twoWindows();
    assert.deepStrictEqual(windowsListed(first.page).at(-1), [
      { id: '2', name: strings.tools.commander },
    ]);
    assert.deepStrictEqual(windowsListed(second.page).at(-1), [
      { id: '1', name: strings.tools.commander },
    ]);
    const told = windowsListed(first.page).length;
    await first.connection.receive({ type: 'selectTab', tab: '5' });
    assert.strictEqual(windowsListed(first.page).length, told);
    await second.connection.receive({ type: 'newWindow' });
    assert.deepStrictEqual(windowsListed(first.page).at(-1), [
      { id: '2', name: strings.tools.commander },
      { id: '3', name: strings.tabs.noTabWindow },
    ]);
  });

  test('passes on the drag of a tab only from the page of the window that holds it, with numbers for where it was grabbed and where the pointer is, saying whether it is the only tab of its window, as the page is not trusted', async () => {
    const host = new FakeHost();
    const { first } = await twoWindows(host);
    const strip = {
      left: 8,
      right: 700,
      top: 0,
      bottom: 32,
      firstTabLeft: 8,
      tabTop: 4,
    };
    const grabbed = { grabX: 20, grabY: 10, screenX: 300, screenY: 40 };
    await first.connection.receive({ type: 'tearTab', tab: '2', ...grabbed });
    await first.connection.receive({
      type: 'tearTab',
      tab: '5',
      ...grabbed,
      screenX: Number.NaN,
    });
    await first.connection.receive({ type: 'tearTab', tab: '5', ...grabbed });
    await first.connection.receive({
      type: 'dragTabTo',
      screenX: Infinity,
      screenY: 3,
    });
    await first.connection.receive({
      type: 'dragTabTo',
      screenX: 310,
      screenY: 50,
    });
    await first.connection.receive({ type: 'visitIndex', index: -1 });
    await first.connection.receive({ type: 'visitIndex', index: 1.5 });
    await first.connection.receive({ type: 'visitIndex', index: 2 });
    await first.connection.receive({
      type: 'tabStrip',
      ...strip,
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      top: 'top' as unknown as number,
    });
    await first.connection.receive({ type: 'tabStrip', ...strip });
    await first.connection.receive({ type: 'dropTab' });
    await first.connection.receive({ type: 'cancelTabDrag' });
    assert.deepStrictEqual(host.dragged, [
      [
        '1',
        {
          kind: 'start',
          tab: '5',
          index: 1,
          grab: { x: 20, y: 10 },
          at: { x: 300, y: 40 },
          alone: false,
        },
      ],
      ['1', { kind: 'move', at: { x: 310, y: 50 } }],
      ['1', { kind: 'index', index: 2 }],
      ['1', { kind: 'strip', strip }],
      ['1', { kind: 'drop' }],
      ['1', { kind: 'cancel' }],
    ]);
  });

  test('ends the drag of a tab where it is once the page of a window goes away, as a window closed, reloaded or crashed while its tab was dragged never ended the drag, and no tab could be torn off again', async () => {
    const host = new FakeHost();
    const { second } = await twoWindows(host);
    second.connection.dispose();
    assert.deepStrictEqual(host.dragged, [['2', { kind: 'drop' }]]);
  });

  test('tells each page whether a tab can be torn off into a window of its own', async () => {
    const { first } = await twoWindows();
    assert.deepStrictEqual(first.page.last('tearsOff'), {
      type: 'tearsOff',
      allowed: true,
    });
  });

  test('tears a tab off into a window kept ready for it, showing it there and in the window it left the tab shown before it, leaving the window in front as it was while that window loaded', async () => {
    const { first, second } = await twoWindows();
    const spare = attach(first.view, 's1');
    await spare.connection.receive({ type: 'ready' });
    first.shell.notify({ level: 'info', message: 'to the window in front' });
    assert.strictEqual(spare.page.last('notice'), undefined);
    assert.ok(second.page.last('notice'));

    assert.strictEqual(await first.shell.tearOff('5', '2'), false);
    assert.strictEqual(await first.shell.tearOff('1', 's1'), true);
    assert.deepStrictEqual(shownIn(spare.page), [['1'], '1']);
    assert.deepStrictEqual(shownIn(first.page), [['5'], '5']);
    assert.strictEqual(await first.shell.tearOff('5', 's2'), false);
  });

  test('tells the window kept ready for a tab torn off neither the notices waiting for a window nor the folders asked about, as it shows them only once a tab is torn into it, long after they were answered or gone', async () => {
    const work = tempFolder('work');
    try {
      const host = new FakeHost();
      const { first, second } = await twoWindows(host);
      await first.shell.openFolders([work]);
      assert.ok(second.page.last('chooseTool'));
      first.connection.dispose();
      second.connection.dispose();
      first.shell.notify({ level: 'info', message: 'update ready' });
      host.unsavedState = [strings.state.putAside('state.json.corrupt')];
      const spare = attach(first.view, 's1');
      await spare.connection.receive({ type: 'ready' });
      assert.deepStrictEqual(noticesOf(spare.page), []);
      assert.strictEqual(spare.page.last('chooseTool'), undefined);

      const reloaded = attach(first.view, '1');
      await reloaded.connection.receive({ type: 'ready' });
      assert.deepStrictEqual(
        noticesOf(reloaded.page).map(([, message]) => plainOf(message)),
        [plainOf(strings.state.putAside('state.json.corrupt')), 'update ready'],
      );
      assert.deepStrictEqual(reloaded.page.last('chooseTool')?.folders, [work]);
    } finally {
      removeFolder(work);
    }
  });

  test('moves a dragged tab into the window whose strip it is over and back out, showing it in the window that holds it, and keeps the window it leaves while the drag lasts though that holds no tab', async () => {
    const host = new FakeHost();
    const { first, second } = await twoWindows(host);
    const spare = attach(first.view, 's1');
    await spare.connection.receive({ type: 'ready' });
    await first.shell.tearOff('1', 's1');
    await first.shell.moveTab('1', '2', 1);
    assert.deepStrictEqual(shownIn(second.page), [['2', '1', '3', '4'], '1']);
    assert.deepStrictEqual(shownIn(spare.page), [[], undefined]);
    assert.deepStrictEqual(host.opened, []);
    assert.deepStrictEqual(first.shell.windows(), ['1', '2', 's1']);

    await first.shell.moveTab('1', '2', 3);
    assert.deepStrictEqual(shownIn(second.page), [['2', '3', '4', '1'], '1']);

    await first.shell.moveTab('1', 's1', 0);
    assert.deepStrictEqual(shownIn(spare.page), [['1'], '1']);
    assert.deepStrictEqual(shownIn(second.page), [['2', '3', '4'], '4']);
    assert.deepStrictEqual(host.opened, []);
  });

  test('shows the page of a window the tab dragged over it, named as it is, and stops showing it once asked', async () => {
    const { first, second } = await twoWindows();
    first.shell.visit('2', { tab: '1', x: 100, grabX: 20 });
    assert.deepStrictEqual(second.page.last('tabVisit'), {
      type: 'tabVisit',
      visit: {
        tab: { id: '1', tool: 'commander', name: strings.tools.commander },
        x: 100,
        grabX: 20,
      },
    });
    first.shell.visit('2', undefined);
    assert.deepStrictEqual(second.page.last('tabVisit'), { type: 'tabVisit' });
  });

  test("tells every window how text is shown once one of them changes it, as that is the app's setting", async () => {
    const { first, second } = await twoWindows();
    const view = {
      wordWrap: false,
      showWhitespace: true,
      highlightSyntax: false,
    };
    await first.connection.receive({ type: 'setTextView', view });
    assert.deepStrictEqual(second.page.last('textView')?.view, view);
  });
});

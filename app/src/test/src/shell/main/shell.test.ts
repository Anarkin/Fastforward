import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ChangeSet } from '@codemirror/state';
import { afterAll, suite, test } from 'vitest';
import { strings } from '../../../../lib/shared/strings';
import { recordingLog } from '../../../helpers/stub';
import {
  closeViews,
  failOnErrorsLogged,
  FakeHost,
  shellOf,
  takeErrorsLogged,
  withView,
} from '../../../helpers/harness';
import { removeFolder, tempFolder } from '../../../helpers/repositories';
import { quitNoteOf } from '../../../../shell/main/shell';
import { saying, noticesOf } from './shellFixtures';

suite('Shell with no tab open', () => {
  const noGit = path.join(os.tmpdir(), 'fastforward-no-git');

  const { log, error: logged } = recordingLog();
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
});

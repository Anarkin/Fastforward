import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ChangeSet } from '@codemirror/state';
import { afterAll, suite, test } from 'vitest';
import { recordingLog, failOnErrorsLogged } from '../../../helpers/stub';
import { closeViews, shellOf, withView } from '../../../helpers/harness';
import { quitNoteOf } from '../../../../shell/main/closing';
import { saying, twoWindows } from './shellFixtures';
import { FakeHost } from '../../../helpers/fakeHost';
import { removeFolder, tempFolder } from '../../../helpers/tempFolders';

suite('Quitting and closing windows', () => {
  const noGit = path.join(os.tmpdir(), 'fastforward-no-git');

  const { log, error: logged } = recordingLog();
  failOnErrorsLogged(logged);

  afterAll(closeViews);

  test('asks before quitting while a tool says quitting would cut its work short, saying what each tool says', () => {
    assert.strictEqual(
      quitNoteOf({
        terminal: saying(),
        commander: saying(),
        git: saying(),
        viewer: saying(),
        editor: saying(),
        diff: saying(),
      }),
      undefined,
    );
    assert.strictEqual(
      quitNoteOf({
        terminal: saying(),
        commander: saying('A copy runs.'),
        git: saying('A clone runs.'),
        viewer: saying(),
        editor: saying(),
        diff: saying(),
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
            tool: 'editor',
            message: { type: 'readEdited', tab },
          });
          assert.strictEqual(shell.asksBeforeQuit(), false);
          await view.connection.receive({
            type: 'tool',
            tool: 'editor',
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
            unsaved: [file],
          });
          shell.askToQuit();
          assert.deepStrictEqual(view.page.last('confirmQuit'), {
            type: 'confirmQuit',
            unsaved: [file],
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
              tool: 'editor',
              message: { type: 'readEdited', tab },
            });
            await view.connection.receive({
              type: 'tool',
              tool: 'editor',
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

  test('saves and closes no tab of another window a page asks to close, as the page is not trusted', async () => {
    const host = new FakeHost();
    const folder = tempFolder('unsaved');
    const file = path.join(folder, 'notes.txt');
    fs.writeFileSync(file, 'one\n');
    host.userSettingsFile = () => Promise.resolve(file);
    try {
      const { first, second } = await twoWindows(log, noGit, host);
      await second.connection.receive({ type: 'openSettings' });
      const tab =
        second.page.tabs?.tabs.find((each) => each.root === file)?.id ?? '';
      await second.connection.receive({
        type: 'tool',
        tool: 'editor',
        message: { type: 'readEdited', tab },
      });
      await second.connection.receive({
        type: 'tool',
        tool: 'editor',
        message: {
          type: 'editText',
          tab,
          update: {
            version: 0,
            changes: ChangeSet.of({ from: 0, insert: 'x' }, 4).toJSON(),
          },
        },
      });
      await first.connection.receive({ type: 'closeTab', tab, save: true });
      assert.strictEqual(fs.readFileSync(file, 'utf8'), 'one\n');
      assert.strictEqual(
        second.page.tabs?.tabs.find((each) => each.id === tab)?.unsaved,
        true,
      );
    } finally {
      removeFolder(folder);
    }
  });

  test('asks the page of a window before closing it while it holds a tab of a tool that confirms closing, as closing a Terminal ends its shell, and leaves closing it to the app once the page confirms', async () => {
    const host = new FakeHost();
    const { first, second } = await twoWindows(log, noGit, host);
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
    const { first, second } = await twoWindows(log, noGit);
    first.shell.focus('2');
    first.shell.closeWindow('2');
    second.connection.dispose();
    first.shell.askToQuit();
    assert.deepStrictEqual(first.page.last('confirmQuit'), {
      type: 'confirmQuit',
    });
  });
});

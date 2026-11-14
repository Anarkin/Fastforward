import * as assert from 'node:assert';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, suite, test } from 'vitest';
import { recordingLog } from '../../../helpers/stub';
import {
  closeViews,
  failOnErrorsLogged,
  FakeHost,
} from '../../../helpers/harness';
import { twoWindows } from './shellFixtures';

suite('Quitting and closing windows', () => {
  const noGit = path.join(os.tmpdir(), 'fastforward-no-git');

  const { log, error: logged } = recordingLog();
  failOnErrorsLogged(logged);

  afterAll(closeViews);

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

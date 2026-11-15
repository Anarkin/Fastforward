import * as assert from 'node:assert';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, suite, test } from 'vitest';
import { plainOf } from '../../../../lib/shared/sentences';
import { strings } from '../../../../lib/shared/strings';
import { recordingLog, failOnErrorsLogged } from '../../../helpers/stub';
import {
  closeViews,
  shellOf,
  terminalHostOf,
  withView,
} from '../../../helpers/harness';
import { FakeHost } from '../../../helpers/fakeHost';

suite('Shell with no tab open', () => {
  const noGit = path.join(os.tmpdir(), 'fastforward-no-git');

  const { log, info, warn: warned, error: logged } = recordingLog();
  failOnErrorsLogged(logged);

  afterAll(closeViews);

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

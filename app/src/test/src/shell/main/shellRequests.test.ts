import * as assert from 'node:assert';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, suite, test } from 'vitest';
import { plainOf } from '../../../../lib/shared/sentences';
import { strings } from '../../../../lib/shared/strings';
import type { ToHost } from '../../../../shell/shared/protocol';
import type { PathFacts } from '../../../../lib/shared/pathFacts';
import { recordingLog, failOnErrorsLogged } from '../../../helpers/stub';
import {
  closeViews,
  shellOf,
  terminalHostOf,
  withView,
  commanderTabName,
} from '../../../helpers/harness';
import { FakeHost } from '../../../helpers/fakeHost';

const forged = (json: string): ToHost => JSON.parse(json);

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
            [commanderTabName, undefined],
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

  test('answers what a page asks of a path to draw the menu of a part of it, and nothing to a forged ask', async () => {
    const host = new FakeHost();
    host.facts.set('C:\\Code', {
      kind: 'folder',
      inRepository: false,
      gitMissing: false,
    });
    await withView(
      log,
      [],
      async (view) => {
        for (const message of [
          '{ "type": "pathFacts", "ask": 1, "path": 5 }',
          '{ "type": "pathFacts", "ask": "1", "path": "C:\\\\Code" }',
          '{ "type": "pathFacts", "path": "C:\\\\Code" }',
          '{ "type": "pathFacts", "ask": 1, "path": "" }',
        ]) {
          await view.connection.receive(JSON.parse(message));
        }
        assert.deepStrictEqual(host.factsAsked, []);
        assert.strictEqual(view.page.last('pathFacts'), undefined);
        await view.connection.receive({
          type: 'pathFacts',
          ask: 3,
          path: 'C:\\Code',
        });
        assert.deepStrictEqual(host.factsAsked, ['C:\\Code']);
        assert.deepStrictEqual(view.page.last('pathFacts'), {
          type: 'pathFacts',
          ask: 3,
          facts: { kind: 'folder', inRepository: false, gitMissing: false },
        });
      },
      true,
      host,
      noGit,
    );
  });

  test('runs a command of the menu of a part of a path only where what the path is allows it, opening a terminal or the commander in a folder, cloning or initing a repository in one, an archive in the commander and the menu of Windows', async () => {
    const host = new FakeHost();
    const folder: PathFacts = {
      kind: 'folder',
      inRepository: false,
      gitMissing: false,
    };
    host.facts.set('C:\\Code', folder);
    host.facts.set('C:\\a.zip', { ...folder, kind: 'file' });
    await withView(
      log,
      [],
      async (view) => {
        const run = (file: string, command: string, more = {}) =>
          view.connection.receive(
            forged(
              JSON.stringify({
                type: 'pathCommand',
                path: file,
                command,
                ...more,
              }),
            ),
          );
        await run('C:\\Code', 'forged');
        await run('C:\\a.zip', 'newTerminal');
        await run('C:\\a.zip', 'openInCommander');
        await run('C:\\a.zip', 'cloneHere');
        await run('C:\\a.zip', 'initHere');
        await run('C:\\Code', 'enterArchive');
        await run('C:\\a.zip', 'systemMenu', { x: '1', y: 2, extended: false });
        await run('C:\\gone', 'systemMenu', { x: 1, y: 2, extended: false });
        assert.deepStrictEqual(view.page.tabs?.tabs ?? [], []);
        assert.deepStrictEqual(
          [host.cloned, host.inited, host.shellMenus],
          [[], [], []],
        );

        await run('C:\\Code', 'newTerminal');
        await run('C:\\Code', 'openInCommander');
        await run('C:\\Code', 'cloneHere');
        await run('C:\\Code', 'initHere');
        await run('C:\\a.zip', 'enterArchive');
        await run('C:\\a.zip', 'systemMenu', { x: 1, y: 2, extended: true });
        assert.deepStrictEqual(
          view.page.tabs?.tabs.map((tab) => [tab.tool, tab.root]),
          [
            ['terminal', 'C:\\Code'],
            ['commander', 'C:\\Code'],
            ['commander', 'C:\\a.zip'],
          ],
        );
        assert.deepStrictEqual(
          [host.cloned, host.inited, host.shellMenus],
          [['C:\\Code'], ['C:\\Code'], [[['C:\\a.zip'], { x: 1, y: 2 }, true]]],
        );
      },
      true,
      host,
      noGit,
    );
  });

  test('views or edits a file of the menu of a part of a path in a tab of its own, nothing that is no file, and says why the editor refuses a file rather than opening it', async () => {
    const host = new FakeHost();
    const file: PathFacts = {
      kind: 'file',
      inRepository: false,
      gitMissing: false,
    };
    host.facts.set('C:\\Code', { ...file, kind: 'folder' });
    host.facts.set('C:\\a.zip\\b.txt', { ...file, kind: 'inArchive' });
    host.facts.set('C:\\notes.txt', file);
    host.facts.set('C:\\movie.mkv', file);
    host.refusals.set('C:\\movie.mkv', 'It is binary.');
    await withView(
      log,
      [],
      async (view) => {
        const run = (at: string, command: string) =>
          view.connection.receive(
            forged(JSON.stringify({ type: 'pathCommand', path: at, command })),
          );
        for (const at of ['C:\\Code', 'C:\\a.zip\\b.txt', 'C:\\gone.txt']) {
          await run(at, 'view');
          await run(at, 'edit');
        }
        assert.deepStrictEqual(view.page.tabs?.tabs ?? [], []);

        await run('C:\\notes.txt', 'view');
        await run('C:\\notes.txt', 'edit');
        await run('C:\\movie.mkv', 'edit');
        assert.deepStrictEqual(
          view.page.tabs?.tabs.map((tab) => [tab.tool, tab.root]),
          [
            ['viewer', 'C:\\notes.txt'],
            ['editor', 'C:\\notes.txt'],
          ],
        );
        assert.deepStrictEqual(view.page.last('notice'), {
          type: 'notice',
          level: 'error',
          message: 'It is binary.',
        });
      },
      true,
      host,
      noGit,
    );
  });

  test('goes to the tab viewing a file already when the menu of a part of a path views it again, as it goes to the tab editing it already, rather than opening another', async () => {
    const host = new FakeHost();
    host.facts.set('C:\\notes.txt', {
      kind: 'file',
      inRepository: false,
      gitMissing: false,
    });
    await withView(
      log,
      [],
      async (view) => {
        const run = (command: string) =>
          view.connection.receive(
            forged(
              JSON.stringify({
                type: 'pathCommand',
                path: 'C:\\notes.txt',
                command,
              }),
            ),
          );
        await run('view');
        await run('edit');
        await run('view');
        await run('edit');
        assert.deepStrictEqual(
          view.page.tabs?.tabs.map((tab) => [tab.tool, tab.root]),
          [
            ['viewer', 'C:\\notes.txt'],
            ['editor', 'C:\\notes.txt'],
          ],
        );
        assert.strictEqual(
          view.page.tabs?.tabs.find((tab) => tab.id === view.page.tabs?.active)
            ?.tool,
          'editor',
        );
        await run('view');
        assert.strictEqual(
          view.page.tabs?.tabs.find((tab) => tab.id === view.page.tabs?.active)
            ?.tool,
          'viewer',
        );
      },
      true,
      host,
      noGit,
    );
  });

  test('follows a link of a document to a file in a viewer tab of its own and to a folder in a commander tab, saying when nothing is there, and follows nothing inside an archive or a forged path', async () => {
    const host = new FakeHost();
    const file: PathFacts = {
      kind: 'file',
      inRepository: false,
      gitMissing: false,
    };
    host.facts.set('C:\\Code', { ...file, kind: 'folder' });
    host.facts.set('C:\\a.zip\\b.md', { ...file, kind: 'inArchive' });
    host.facts.set('C:\\Code\\notes.md', file);
    await withView(
      log,
      [],
      async (view) => {
        const follow = (at: unknown) =>
          view.connection.receive(
            forged(
              JSON.stringify({
                type: 'pathCommand',
                path: at,
                command: 'follow',
              }),
            ),
          );
        await follow('C:\\a.zip\\b.md');
        await follow(42);
        assert.deepStrictEqual(view.page.tabs?.tabs ?? [], []);

        await follow('C:\\Code\\notes.md');
        await follow('C:\\Code');
        await follow('C:\\Code\\gone.md');
        assert.deepStrictEqual(
          view.page.tabs?.tabs.map((tab) => [tab.tool, tab.root]),
          [
            ['viewer', 'C:\\Code\\notes.md'],
            ['commander', 'C:\\Code'],
          ],
        );
        assert.deepStrictEqual(view.page.last('notice'), {
          type: 'notice',
          level: 'error',
          message: strings.viewer.linkLeadsNowhere('C:\\Code\\gone.md'),
        });
      },
      true,
      host,
      noGit,
    );
  });

  test('answers which parts of the paths a page asks about are hidden, files or programs, and nothing to a forged ask', async () => {
    const host = new FakeHost();
    await withView(
      log,
      [],
      async (view) => {
        for (const message of [
          '{ "type": "partLooks", "paths": "C:\\\\Temp" }',
          '{ "type": "partLooks", "paths": [] }',
          '{ "type": "partLooks", "paths": [5] }',
          '{ "type": "partLooks" }',
        ]) {
          await view.connection.receive(JSON.parse(message));
        }
        assert.deepStrictEqual(host.looked, []);
        assert.strictEqual(view.page.last('partLooks'), undefined);
        await view.connection.receive({
          type: 'partLooks',
          paths: ['C:\\.hidden'],
        });
        assert.deepStrictEqual(host.looked, [['C:\\.hidden']]);
        assert.deepStrictEqual(view.page.last('partLooks'), {
          type: 'partLooks',
          looks: [
            {
              path: 'C:\\.hidden',
              parts: [{ hidden: true, file: true, executable: false }],
            },
          ],
        });
      },
      true,
      host,
      noGit,
    );
  });

  test('leaves long lines whole, highlights syntax and shows whitespace by default, for the diff and the viewer alike, and remembers what is chosen in either, telling the page', async () => {
    await withView(
      log,
      [],
      async (view) => {
        assert.deepStrictEqual(view.page.last('textView')?.view, {
          wordWrap: false,
          showWhitespace: true,
          highlightSyntax: true,
          highlightOccurrences: true,
        });
        const chosen = {
          wordWrap: true,
          showWhitespace: false,
          highlightSyntax: false,
          highlightOccurrences: false,
        };
        await view.connection.receive({ type: 'setTextView', view: chosen });
        assert.deepStrictEqual(view.settings.settings.text, {
          ...chosen,
          tabSize: 4,
        });
        assert.deepStrictEqual(view.page.last('textView')?.view, chosen);
        await view.connection.receive({ type: 'ready' });
        assert.deepStrictEqual(view.page.last('textView')?.view, chosen);
        await view.connection.receive(
          forged('{ "type": "setTextView", "view": { "wordWrap": "yes" } }'),
        );
        assert.deepStrictEqual(view.settings.settings.text, {
          ...chosen,
          tabSize: 4,
        });
      },
      true,
      undefined,
      noGit,
    );
  });

  test('fits images to the viewer by default, and remembers when they are chosen at their real size, telling the page', async () => {
    await withView(
      log,
      [],
      async (view) => {
        assert.deepStrictEqual(view.page.last('imageView')?.view, {
          realSize: false,
        });
        const chosen = { realSize: true };
        await view.connection.receive({ type: 'setImageView', view: chosen });
        assert.deepStrictEqual(view.settings.settings.tools.viewer, chosen);
        assert.deepStrictEqual(view.page.last('imageView')?.view, chosen);
        await view.connection.receive({ type: 'ready' });
        assert.deepStrictEqual(view.page.last('imageView')?.view, chosen);
        await view.connection.receive(
          forged('{ "type": "setImageView", "view": { "realSize": "yes" } }'),
        );
        assert.deepStrictEqual(view.settings.settings.tools.viewer, chosen);
      },
      true,
      undefined,
      noGit,
    );
  });

  test('logs what the page sends at its level, marked as from the webview', async () => {
    const recording = recordingLog();
    await withView(
      recording.log,
      [],
      async (view) => {
        await view.connection.receive({
          type: 'log',
          level: 'info',
          message: 'from the page',
        });
        await view.connection.receive({
          type: 'log',
          level: 'error',
          message: 'failed in the page',
        });
        assert.ok(recording.info.includes('Webview: from the page'));
        assert.deepStrictEqual(recording.error, [
          'Webview: failed in the page',
        ]);
      },
      true,
      undefined,
      noGit,
    );
  });
});

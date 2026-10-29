import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import type { Log } from '../../../../shell/main/log';
import type { Page, Tab } from '../../../../shell/main/shell';
import type { ToWebview } from '../../../../shell/shared/protocol';
import { flowLimits } from '../../../../tools/terminal/main/flowControl';
import type { ShellLaunch } from '../../../../tools/terminal/main/hostProtocol';
import { PtyHost } from '../../../../tools/terminal/main/sessions';
import {
  TerminalTool,
  type HostListener,
} from '../../../../tools/terminal/main/tool';
import {
  maxInputLength,
  type TerminalToHost,
  type TerminalToWebview,
} from '../../../../tools/terminal/shared/protocol';
import { strings } from '../../../../shared/strings';
import { fakePtys, until } from '../../../fakePty';
import { fakeTimer } from '../../../fakeTimer';

class TerminalPage implements Page {
  readonly messages: TerminalToWebview[] = [];
  disposed = false;

  post(message: ToWebview): void {
    if (message.type === 'tool' && message.tool === 'terminal') {
      this.messages.push(message.message);
    }
  }

  of<T extends TerminalToWebview['type']>(
    type: T,
  ): Extract<TerminalToWebview, { readonly type: T }>[] {
    return this.messages.filter(
      (message): message is Extract<TerminalToWebview, { readonly type: T }> =>
        message.type === type,
    );
  }

  output(): string {
    return this.of('output')
      .map((message) => message.data)
      .join('');
  }
}

const work: Tab = { id: '1', tool: 'terminal', root: '/work' };
const other: Tab = { id: '2', tool: 'terminal' };

function launchIn(folder: string | undefined): ShellLaunch {
  return { file: 'sh', args: [], cwd: folder ?? '/home/me', env: {} };
}

function terminal() {
  const ptys = fakePtys();
  const clock = fakeTimer();
  const errors: unknown[] = [];
  const log: Log = {
    info: () => {},
    warn: () => {},
    error: (error) => errors.push(error),
  };
  const listeners: HostListener[] = [];
  const hosts: PtyHost[] = [];
  const tool = new TerminalTool(
    log,
    (listener) => {
      listeners.push(listener);
      const host = new PtyHost(
        ptys.spawn,
        (event) => listener.event(event),
        flowLimits,
        clock.timer,
      );
      hosts.push(host);
      return {
        send: (command) => host.receive(command),
        dispose: () => host.dispose(),
      };
    },
    () => ({
      shell: '',
      shellArgs: [],
      renderer: 'dom',
      scrollback: 5000,
      minimumContrastRatio: 30,
    }),
    launchIn,
    { backend: 'conpty', buildNumber: 26200 },
  );
  tool.attach({
    page: () => undefined,
    tabs: () => [work, other],
    active: () => undefined,
    open: () => Promise.resolve(),
    postTabs: () => {},
    notice: () => {},
    track: (tracked) => tracked,
    idle: () => Promise.resolve(),
  });
  const page = new TerminalPage();
  const send = (message: TerminalToHost, from: Page = page) =>
    tool.receive(from, message);
  const open = async (tab: Tab, on: TerminalPage = page) => {
    await tool.show(on, tab);
    const screens = on.of('screen').length;
    await send({ type: 'open', tab: tab.id, columns: 80, rows: 24 }, on);
    await until(() => on.of('screen').length > screens);
    return on.of('screen').at(-1);
  };
  const stopHost = (code: number) => {
    hosts.at(-1)?.dispose();
    listeners.at(-1)?.stopped(code);
  };
  return { tool, ptys, clock, errors, listeners, page, send, open, stopHost };
}

suite('Terminal tool', () => {
  test('tells the page which renderer to use and how many lines to keep once it is ready, and which build of Windows runs the shells', () => {
    const { tool, page } = terminal();
    tool.ready(page);
    assert.deepStrictEqual(page.messages, [
      {
        type: 'settings',
        renderer: 'dom',
        scrollback: 5000,
        minimumContrastRatio: 21,
        windowsPty: { backend: 'conpty', buildNumber: 26200 },
      },
    ]);
  });

  test('starts no terminal process until a tab asks for its shell', async () => {
    const { tool, page, listeners } = terminal();
    await tool.show(page, work);
    tool.hide(page);
    tool.closed(page, work);
    assert.deepStrictEqual(page.messages, [{ type: 'show', tab: '1' }]);
    assert.strictEqual(listeners.length, 0);
  });

  test('starts the shell of a tab in its folder at the size the page asks for, and sends the page its screen', async () => {
    const { ptys, open } = terminal();
    const screen = await open(work);
    const [pty] = ptys.spawned;
    assert.deepStrictEqual(
      [pty.launch.cwd, pty.columns, pty.rows],
      ['/work', 80, 24],
    );
    assert.deepStrictEqual(screen, {
      type: 'screen',
      tab: '1',
      data: '',
      exited: false,
    });
  });

  test('takes the shell and its arguments from the settings and its folder from the tab, whatever else the page sends, as the page is not trusted', async () => {
    const { tool, ptys, page, send } = terminal();
    await tool.show(page, work);
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const open = {
      type: 'open',
      tab: '1',
      columns: 80,
      rows: 24,
      file: 'evil.exe',
      args: ['--evil'],
      cwd: '/',
      env: { PATH: '/evil' },
    } as unknown as TerminalToHost;
    await send(open);
    assert.deepStrictEqual(ptys.last().launch, launchIn('/work'));
  });

  test('passes on what the page types only for the tab it shows, as text no longer than a chunk', async () => {
    const { ptys, page, send, open } = terminal();
    await open(work);
    const otherPage = new TerminalPage();
    await send({ type: 'input', tab: '2', data: 'not shown' });
    await send({ type: 'input', tab: '1', data: 'other page' }, otherPage);
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    await send({ type: 'input', tab: '1', data: 1 as unknown as string });
    await send({
      type: 'input',
      tab: '1',
      data: 'x'.repeat(maxInputLength + 1),
    });
    await send({ type: 'input', tab: '1', data: 'ls\r' });
    assert.deepStrictEqual(ptys.last().written, ['ls\r']);
    assert.strictEqual(page.of('output').length, 0);
  });

  test('passes on what is typed before the screen comes, so nothing typed into a terminal just opened is lost', async () => {
    const { tool, ptys, page, send } = terminal();
    await tool.show(page, work);
    await send({ type: 'open', tab: '1', columns: 80, rows: 24 });
    await send({ type: 'input', tab: '1', data: 'early' });
    assert.strictEqual(page.of('screen').length, 0);
    assert.deepStrictEqual(ptys.last().written, ['early']);
  });

  test('resizes the shell only to a whole number of columns and rows from 1 to 1000', async () => {
    const { ptys, send, open } = terminal();
    await open(work);
    for (const [columns, rows] of [
      [0, 24],
      [1001, 24],
      [80.5, 24],
      [80, Number.NaN],
    ]) {
      await send({ type: 'resize', tab: '1', columns, rows });
    }
    await send({ type: 'resize', tab: '1', columns: 120, rows: 40 });
    assert.deepStrictEqual(ptys.last().sizes, [[120, 40]]);
  });

  test('sends the page the output of the shell of the tab it shows, and nothing of the others', async () => {
    const { ptys, clock, page, open } = terminal();
    await open(work);
    await open(other);
    const [first, second] = ptys.spawned;
    first.print('hidden');
    second.print('shown');
    await clock.fire();
    await clock.fire();
    assert.strictEqual(page.output(), 'shown');
  });

  test('keeps the shell running while the page reloads, and sends the new page the screen so far', async () => {
    const { tool, ptys, clock, page, open } = terminal();
    await open(work);
    ptys.last().print('before the reload');
    await clock.fire();
    page.disposed = true;
    tool.hide(page);
    const reloaded = new TerminalPage();
    const screen = await open(work, reloaded);
    assert.strictEqual(ptys.spawned.length, 1);
    assert.ok(screen?.data.includes('before the reload'), screen?.data);
  });

  test('tells the page when the shell exits, and starts it again only when the page asks', async () => {
    const { ptys, clock, page, send, open } = terminal();
    await open(work);
    await send({ type: 'restart', tab: '1' });
    assert.strictEqual(ptys.spawned.length, 1);
    ptys.last().exit(0);
    await clock.fire();
    assert.deepStrictEqual(page.of('exited'), [{ type: 'exited', tab: '1' }]);
    assert.ok(page.output().includes(strings.terminal.exited(0)));
    await open(work);
    assert.strictEqual(ptys.spawned.length, 1);
    await send({ type: 'input', tab: '1', data: 'ignored' });
    await send({ type: 'restart', tab: '1' });
    assert.strictEqual(ptys.spawned.length, 2);
    assert.deepStrictEqual(ptys.spawned.at(0)?.written, []);
  });

  test('kills the shell of a tab once it is closed', async () => {
    const { tool, ptys, page, open } = terminal();
    await open(work);
    tool.closed(page, work);
    assert.strictEqual(ptys.last().killed, true);
  });

  test('tells the page when the terminal process stops, and starts a new one with a new shell when the page asks', async () => {
    const { ptys, errors, listeners, page, send, open, stopHost } = terminal();
    await open(work);
    stopHost(1);
    assert.deepStrictEqual(errors, [strings.log.terminalHostStopped(1)]);
    assert.ok(page.output().includes(strings.terminal.stopped));
    assert.deepStrictEqual(page.of('exited'), [{ type: 'exited', tab: '1' }]);
    await send({ type: 'restart', tab: '1' });
    await until(() => page.of('screen').length === 2);
    assert.strictEqual(listeners.length, 2);
    assert.strictEqual(ptys.spawned.length, 2);
  });

  test('sends the page a screen telling the terminal process stopped when it stops before the screen came', async () => {
    const { tool, page, send, stopHost } = terminal();
    await tool.show(page, work);
    await send({ type: 'open', tab: '1', columns: 80, rows: 24 });
    stopHost(1);
    assert.deepStrictEqual(page.of('screen'), [
      {
        type: 'screen',
        tab: '1',
        data: `\r\n${strings.terminal.stopped}\r\n`,
        exited: true,
      },
    ]);
  });

  test('kills every shell on quit, without taking the terminal process stopping then for a failure', async () => {
    const { tool, ptys, errors, open, stopHost } = terminal();
    await open(work);
    tool.quit();
    stopHost(0);
    assert.strictEqual(ptys.last().killed, true);
    assert.deepStrictEqual(errors, []);
  });

  test('names a tab after its folder, or Terminal when it has none', () => {
    const { tool } = terminal();
    assert.deepStrictEqual(
      [...tool.names([work, other])],
      [
        ['1', { name: 'work' }],
        ['2', { name: 'Terminal' }],
      ],
    );
  });
});

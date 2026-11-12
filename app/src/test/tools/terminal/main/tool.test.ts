import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import type { Log } from '../../../../shell/main/log';
import type { Page, Tab } from '../../../../shell/main/shell';
import type { ToWebview } from '../../../../shell/shared/protocol';
import { flowLimits } from '../../../../tools/terminal/main/flowControl';
import {
  visitsIn,
  type FolderVisits,
} from '../../../../tools/terminal/main/folderRanks';
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

const day = 24 * 3_600_000;

function terminal(
  seen: readonly FolderVisits[] = [],
  {
    isFolder = (folder) => Promise.resolve(!folder.startsWith('/gone')),
    launch = (folder) => Promise.resolve(launchIn(folder)),
  }: {
    readonly isFolder?: (folder: string) => Promise<boolean>;
    readonly launch?: (folder: string | undefined) => Promise<ShellLaunch>;
  } = {},
) {
  const ptys = fakePtys();
  const clock = fakeTimer();
  const saved = new Map<string, unknown>([['folders', seen]]);
  const chosen: string[] = [];
  const opened: (readonly (string | undefined)[])[] = [];
  const recent = { items: 10 };
  const visitsOf = (folder: string) =>
    visitsIn(saved.get('folders')).find((entry) => entry.folder === folder)
      ?.visits;
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
        undefined,
        { platform: 'linux', hostname: 'box' },
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
    launch,
    { backend: 'conpty', buildNumber: 26200 },
    {
      store: {
        get: (key) => saved.get(key),
        update: (key, value) => {
          saved.set(key, value);
          return Promise.resolve();
        },
      },
      home: '/home/me',
      isFolder,
      now: () => 100 * day,
      choose: () => Promise.resolve(chosen),
    },
  );
  const moved: (readonly [string, string])[] = [];
  tool.attach({
    page: () => page,
    pages: () => pages,
    current: (shownIn) => shownIn,
    tabs: () => [work, other],
    active: () => undefined,
    shown: () => [],
    open: (_page, _tool, roots) => {
      opened.push(roots);
      return Promise.resolve();
    },
    openView: () => Promise.resolve(),
    openCompare: () => Promise.resolve(),
    openFolders: () => Promise.resolve(),
    setRoot: (tab, root) => moved.push([tab, root]),
    visited: () => {},
    recentFolders: () => recent.items,
    postTabs: () => {},
    notice: () => {},
    track: (tracked) => tracked,
    idle: () => Promise.resolve(),
  });
  const page = new TerminalPage();
  const pages: TerminalPage[] = [page];
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
  const listed = () => page.of('folders').at(-1)?.folders;
  return {
    tool,
    ptys,
    clock,
    errors,
    listeners,
    moved,
    saved,
    chosen,
    opened,
    recent,
    visitsOf,
    listed,
    page,
    pages,
    send,
    open,
    stopHost,
  };
}

suite('Terminal tool', () => {
  test('tells the page which renderer to use and how many lines to keep once it is ready, which build of Windows runs the shells, and the folders to offer', async () => {
    const { tool, page } = terminal();
    tool.ready(page);
    await until(() => page.messages.length === 2);
    assert.deepStrictEqual(page.messages, [
      {
        type: 'settings',
        renderer: 'dom',
        scrollback: 5000,
        minimumContrastRatio: 21,
        windowsPty: { backend: 'conpty', buildNumber: 26200 },
      },
      { type: 'folders', folders: [] },
    ]);
  });

  test('starts no terminal process until a tab asks for its shell', async () => {
    const { tool, page, listeners } = terminal();
    await tool.show(page, work);
    tool.hide(page);
    tool.closed(page, work);
    assert.deepStrictEqual(page.messages, [
      { type: 'show', tab: '1' },
      { type: 'hide' },
    ]);
    assert.strictEqual(listeners.length, 0);
  });

  test('tells the page to stop showing its terminal once another tool is shown, in order with the show that comes next, as the page learns which tool is shown from another message', async () => {
    const { tool, page } = terminal();
    await tool.show(page, work);
    tool.hide(page);
    tool.hide(page);
    await tool.show(page, work);
    assert.deepStrictEqual(page.messages, [
      { type: 'show', tab: '1' },
      { type: 'hide' },
      { type: 'show', tab: '1' },
    ]);
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

  test('starts the shell once the system answers where it starts, holding nothing up meanwhile, and passes on what is typed meanwhile after it', async () => {
    const answers: (() => void)[] = [];
    const { tool, ptys, page, send } = terminal([], {
      launch: (folder) =>
        new Promise((resolve) => answers.push(() => resolve(launchIn(folder)))),
    });
    await tool.show(page, work);
    const opened = send({ type: 'open', tab: '1', columns: 80, rows: 24 });
    const typed = send({ type: 'input', tab: '1', data: 'early' });
    assert.strictEqual(ptys.spawned.length, 0);
    answers[0]?.();
    await Promise.all([opened, typed]);
    assert.deepStrictEqual(
      [ptys.last().launch.cwd, ptys.last().written],
      ['/work', ['early']],
    );
  });

  test('starts the shell of a tab while that of another waits for the system to answer where it starts, and leaves the other detached once it starts, as a share cut off from the network held up every terminal', async () => {
    const answers: (() => void)[] = [];
    const { tool, ptys, page, send } = terminal([], {
      launch: (folder) =>
        folder === '/work'
          ? new Promise((resolve) =>
              answers.push(() => resolve(launchIn(folder))),
            )
          : Promise.resolve(launchIn(folder)),
    });
    await tool.show(page, work);
    const waiting = send({ type: 'open', tab: '1', columns: 80, rows: 24 });
    await tool.show(page, other);
    await send({ type: 'open', tab: '2', columns: 80, rows: 24 });
    await send({ type: 'input', tab: '2', data: 'ls' });

    assert.deepStrictEqual(
      ptys.spawned.map((pty) => [pty.launch.cwd, pty.written]),
      [['/home/me', ['ls']]],
    );
    const screens = page.of('screen').length;
    answers[0]?.();
    await waiting;
    await until(() => ptys.spawned.length === 2);
    ptys.spawned[1]?.print('from work');
    await send({ type: 'input', tab: '2', data: 'pwd' });

    assert.deepStrictEqual(
      ptys.spawned.map((pty) => pty.launch.cwd),
      ['/home/me', '/work'],
    );
    assert.strictEqual(page.of('screen').length, screens);
    assert.ok(!page.output().includes('from work'));
  });

  test('starts no shell once quitting, though the system answers where it starts after', async () => {
    const answers: (() => void)[] = [];
    const { tool, ptys, page, send, listeners } = terminal([], {
      launch: (folder) =>
        new Promise((resolve) => answers.push(() => resolve(launchIn(folder)))),
    });
    await tool.show(page, work);
    const opened = send({ type: 'open', tab: '1', columns: 80, rows: 24 });
    tool.quit();
    answers[0]?.();
    await opened;
    assert.deepStrictEqual([listeners.length, ptys.spawned.length], [0, 0]);
  });

  test('resizes the shell only to a whole number of columns and rows from 1, to as many as 1000 of them past them', async () => {
    const { ptys, send, open } = terminal();
    await open(work);
    for (const [columns, rows] of [
      [0, 24],
      [80.5, 24],
      [80, Number.NaN],
    ]) {
      await send({ type: 'resize', tab: '1', columns, rows });
    }
    await send({ type: 'resize', tab: '1', columns: 120, rows: 40 });
    await send({ type: 'resize', tab: '1', columns: 1200, rows: 40 });
    assert.deepStrictEqual(ptys.last().sizes, [
      [120, 40],
      [1000, 40],
    ]);
  });

  test('starts the shell of a terminal wider than 1000 columns at 1000 of them, as it never started', async () => {
    const { tool, ptys, page, send } = terminal();
    await tool.show(page, work);
    await send({ type: 'open', tab: '1', columns: 1150, rows: 24 });
    await until(() => page.of('screen').length > 0);
    assert.deepStrictEqual([ptys.last().columns, ptys.last().rows], [1000, 24]);
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

  test('knows the folder the shell of a tab reported last, until the shell starts again', async () => {
    const { tool, ptys, clock, send, open } = terminal();
    await open(work);
    assert.strictEqual(tool.folderOf(work), undefined);
    ptys.last().print('\x1b]9;9;/work/app\x07');
    await clock.fire();
    await until(() => tool.folderOf(work) === '/work/app');
    assert.strictEqual(tool.folderOf(other), undefined);
    ptys.last().exit(0);
    await clock.fire();
    await send({ type: 'restart', tab: '1' });
    assert.strictEqual(tool.folderOf(work), undefined);
  });

  test('makes the folder the shell of a tab goes to the folder of the tab, which names it and is where a new shell starts, once each time it goes to another', async () => {
    const { ptys, clock, moved, open, visitsOf } = terminal();
    await open(work);
    ptys
      .last()
      .print('\x1b]9;9;/work/app\x07\x1b]9;9;/work/app\x07\x1b]9;9;/work\x07');
    await clock.fire();
    await until(() => moved.length === 2);
    await until(() => visitsOf('/work/app') === 1);
    assert.deepStrictEqual(moved, [
      ['1', '/work/app'],
      ['1', '/work'],
    ]);
  });

  test('counts a folder once a command has run in it, once each time the shell comes to it, leaving out the folders it only passes through', async () => {
    const { ptys, clock, open, saved, listed } = terminal();
    await open(work);
    ptys
      .last()
      .print(
        [
          '/code',
          '/code/app',
          '/code/app',
          '/code/app',
          '/code',
          '/code/app',
          '/code/app',
        ]
          .map((folder) => `\x1b]9;9;${folder}\x07`)
          .join(''),
      );
    await clock.fire();
    await until(() => listed()?.length === 1);
    await until(
      () =>
        JSON.stringify(saved.get('folders')) ===
        JSON.stringify([{ folder: '/code/app', visits: 2, last: 100 * day }]),
    );
    assert.deepStrictEqual(listed(), ['/code/app']);
  });

  test('counts the folders a terminal opens in, and those other tools open', async () => {
    const { tool, page, opened, visitsOf } = terminal();
    await tool.open(page, ['/code/site']);
    tool.visited('/code/repo');
    assert.deepStrictEqual(opened, [['/code/site']]);
    assert.deepStrictEqual(
      [visitsOf('/code/site'), visitsOf('/code/repo')],
      [1, 1],
    );
  });

  test('lists as many folders as the settings say, telling the page again once they change', async () => {
    const { tool, page, listed, recent } = terminal(
      ['/a', '/b', '/c', '/d'].map((folder, index) => ({
        folder,
        visits: 10 - index,
        last: 100 * day,
      })),
    );
    tool.ready(page);
    await until(() => page.of('folders').length === 1);
    assert.deepStrictEqual(listed(), ['/a', '/b', '/c', '/d']);
    recent.items = 2;
    tool.reloadSettings();
    await until(() => page.of('folders').length === 2);
    assert.deepStrictEqual(listed(), ['/a', '/b']);
  });

  test('lists the folders it ranks first, those that still exist, leaving out the home folder, which a new terminal opens in anyway', async () => {
    const folders = Array.from({ length: 12 }, (_, index) => `/code/${index}`);
    const { tool, page, listed } = terminal([
      { folder: '/home/me', visits: 500, last: 100 * day },
      { folder: '/gone/away', visits: 400, last: 100 * day },
      ...folders.map((folder, index) => ({
        folder,
        visits: 100 - index,
        last: 100 * day,
      })),
    ]);
    tool.ready(page);
    await until(() => listed() !== undefined);
    assert.deepStrictEqual(listed(), folders.slice(0, 10));
  });

  test('lists the folders without holding anything up while one of them does not answer, as a share cut off from the network, telling the page once it does', async () => {
    const answers: ((is: boolean) => void)[] = [];
    const { tool, page, listed } = terminal(
      [
        { folder: '/share/work', visits: 2, last: 100 * day },
        { folder: '/code/app', visits: 1, last: 100 * day },
      ],
      {
        isFolder: (folder) =>
          folder.startsWith('/share')
            ? new Promise((resolve) => answers.push(resolve))
            : Promise.resolve(true),
      },
    );
    tool.ready(page);
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.strictEqual(listed(), undefined);
    answers[0]?.(true);
    await until(() => listed() !== undefined);
    assert.deepStrictEqual(listed(), ['/share/work', '/code/app']);
  });

  test('tells the page the folders as they are after the last change, though those of an earlier one answer later', async () => {
    const answers: ((is: boolean) => void)[] = [];
    const { tool, page, send, listed } = terminal(
      [{ folder: '/share/work', visits: 1, last: 100 * day }],
      {
        isFolder: () =>
          answers.length === 0
            ? new Promise((resolve) => answers.push(resolve))
            : Promise.resolve(true),
      },
    );
    tool.ready(page);
    await send({ type: 'forgetFolder', folder: '/share/work' });
    await until(() => listed() !== undefined);
    answers[0]?.(true);
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.deepStrictEqual(page.of('folders'), [
      { type: 'folders', folders: [] },
    ]);
  });

  test('opens a folder it listed in a new tab, the folders picked on Browse, and a new tab in the home folder on New, but no folder it did not list', async () => {
    const { tool, page, send, chosen, opened } = terminal([
      { folder: '/code/app', visits: 3, last: 100 * day },
    ]);
    tool.ready(page);
    await send({ type: 'openFolder', folder: '/code/app' });
    await send({ type: 'openFolder', folder: '/elsewhere' });
    chosen.push('/picked/one', '/picked/two');
    await send({ type: 'browseFolders' });
    await send({ type: 'newTab' });
    assert.deepStrictEqual(opened, [
      ['/code/app'],
      ['/picked/one', '/picked/two'],
      [undefined],
    ]);
  });

  test('forgets a folder when asked, its visits counting from nothing should the shell come back to it, rather than barring it', async () => {
    const { tool, page, send, listed, visitsOf } = terminal([
      { folder: '/code/app', visits: 50, last: 100 * day },
      { folder: '/code/site', visits: 10, last: 100 * day },
    ]);
    tool.ready(page);
    await until(() => page.of('folders').length === 1);
    await send({ type: 'forgetFolder', folder: '/code/app' });
    await until(() => page.of('folders').length === 2);
    assert.deepStrictEqual(listed(), ['/code/site']);
    await tool.open(page, ['/code/app']);
    assert.strictEqual(visitsOf('/code/app'), 1);
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

suite('Terminal tool in several windows', () => {
  test('shows a terminal tab in each window at once, sending each page the output of the shell of its own tab', async () => {
    const { ptys, clock, page, open } = terminal();
    const second = new TerminalPage();
    await open(work);
    await open(other, second);
    const [first, next] = ptys.spawned;
    first?.print('first');
    next?.print('second');
    await clock.fire();
    await clock.fire();
    assert.strictEqual(page.output(), 'first');
    assert.strictEqual(second.output(), 'second');
  });

  test('passes on what a page types only to the shell of the tab that page shows', async () => {
    const { ptys, send, open } = terminal();
    const second = new TerminalPage();
    await open(work);
    await open(other, second);
    await send({ type: 'input', tab: '2', data: 'not shown here' });
    await send({ type: 'input', tab: '2', data: 'ls\r' }, second);
    assert.deepStrictEqual(ptys.spawned[0]?.written, []);
    assert.deepStrictEqual(ptys.spawned[1]?.written, ['ls\r']);
  });

  test('leaves the shell of one window attached while another window stops showing its own', async () => {
    const { tool, ptys, clock, page, open } = terminal();
    const second = new TerminalPage();
    await open(work);
    await open(other, second);
    tool.hide(second);
    ptys.spawned[0]?.print('still shown');
    await clock.fire();
    assert.strictEqual(page.output(), 'still shown');
    assert.strictEqual(second.of('hide').length, 1);
  });

  test('shows a tab moved to another window there, telling the window it left to stop showing it, and leaves it attached once that window shows another tab', async () => {
    const { ptys, clock, page, open } = terminal();
    const second = new TerminalPage();
    await open(work);
    const screen = await open(work, second);
    await open(other);
    ptys.spawned[0]?.print('moved');
    await clock.fire();
    assert.ok(screen !== undefined);
    assert.strictEqual(page.of('hide').length, 1);
    assert.strictEqual(second.output(), 'moved');
    assert.strictEqual(ptys.spawned.length, 2);
  });

  test('answers where the cursor is for a tab moved to another window until that window shows it, as the shell asked while the window it left was still attached and no one answered', async () => {
    const { tool, ptys, clock, open } = terminal();
    const second = new TerminalPage();
    await open(work);
    await tool.show(second, work);
    ptys.last().print('ab\x1b[6n');
    await clock.fire();
    await until(() => ptys.last().written.includes('\x1b[1;3R'));
  });

  test('tells every window that shows a terminal that the terminal process stopped', async () => {
    const { page, open, stopHost } = terminal();
    const second = new TerminalPage();
    await open(work);
    await open(other, second);
    stopHost(1);
    assert.ok(page.output().includes(strings.terminal.stopped));
    assert.ok(second.output().includes(strings.terminal.stopped));
  });

  test('tells every window the folders to offer once they change, as each lists them in its + menu', async () => {
    const { tool, page, pages } = terminal();
    const second = new TerminalPage();
    pages.push(second);
    tool.ready(page);
    tool.ready(second);
    await until(
      () =>
        page.of('folders').length === 1 && second.of('folders').length === 1,
    );
    tool.visited('/code/app');
    await until(
      () =>
        page.of('folders').length === 2 && second.of('folders').length === 2,
    );
    assert.deepStrictEqual(second.of('folders').at(-1)?.folders, ['/code/app']);
  });
});

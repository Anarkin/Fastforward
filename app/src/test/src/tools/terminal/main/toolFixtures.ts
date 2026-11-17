import type { Log } from '../../../../../shell/main/log';
import type { Page, Tab } from '../../../../../shell/main/toolContract';
import type { ToWebview } from '../../../../../shell/shared/protocol';
import { flowLimits } from '../../../../../tools/terminal/main/flowControl';
import {
  visitsIn,
  type FolderVisits,
} from '../../../../../tools/terminal/main/folderRanks';
import type { ShellLaunch } from '../../../../../tools/terminal/main/hostProtocol';
import { PtyHost } from '../../../../../tools/terminal/main/sessions';
import type { HostListener } from '../../../../../tools/terminal/main/hostLink';
import { TerminalTool } from '../../../../../tools/terminal/main/tool';
import type {
  TerminalToHost,
  TerminalToWebview,
} from '../../../../../tools/terminal/shared/protocol';
import { fakePtys } from '../../../../helpers/fakePty';
import { fakeTimer } from '../../../../helpers/fakeTimer';
import { until } from '../../../../helpers/fixtures';

export class TerminalPage implements Page {
  readonly messages: TerminalToWebview[] = [];
  disposed = false;
  drawn: ((tab: string, chars: number) => void) | undefined;

  post(message: ToWebview): void {
    if (message.type === 'tool' && message.tool === 'terminal') {
      const shown = message.message;
      this.messages.push(shown);
      if (shown.type === 'output') {
        queueMicrotask(() => this.drawn?.(shown.tab, shown.data.length));
      }
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

export const work: Tab = { id: '1', tool: 'terminal', root: '/work' };
export const other: Tab = { id: '2', tool: 'terminal' };

export function launchIn(folder: string | undefined): ShellLaunch {
  return { file: 'sh', args: [], cwd: folder ?? '/home/me', env: {} };
}

export const day = 24 * 3_600_000;

export function terminal(
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
    tabsOf: () => [work, other],
    active: () => undefined,
    holds: () => true,
    shown: () => [],
    open: (_page, _tool, roots) => {
      opened.push(roots);
      return Promise.resolve();
    },
    openView: () => Promise.resolve(),
    openEdit: () => Promise.resolve(),
    openCompare: () => Promise.resolve(),
    openFolders: () => Promise.resolve(),
    setRoot: (tab, root) => moved.push([tab, root]),
    setVersion: () => {},
    setCompare: () => {},
    visited: () => {},
    recentFolders: () => recent.items,
    postTabs: () => {},
    notice: () => {},
    track: (tracked) => tracked,
    idle: () => Promise.resolve(),
  });
  const page = new TerminalPage();
  page.drawn = (tab, chars) =>
    void tool.receive(page, { type: 'ack', tab, chars });
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

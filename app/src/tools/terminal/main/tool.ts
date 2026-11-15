import * as fs from 'node:fs';
import * as path from 'node:path';
import { HostLink, type ConnectHost } from './hostLink';
import type { HostEvent, ShellLaunch } from './hostProtocol';
import { RecentFolders, type FolderAccess } from './recentFolders';
import type { Log } from '../../../shell/main/log';
import {
  unattachedShell,
  type Page,
  type ShellAccess,
  type Tab,
  type TabName,
  type Tool,
} from '../../../shell/main/toolContract';
import {
  sizeWithin,
  maxInputLength,
  type TerminalToHost,
  type TerminalToWebview,
  type WindowsPty,
} from '../shared/protocol';
import {
  contrastRatio,
  scrollbackLines,
  type TerminalSettings,
} from '../shared/settings';
import { strings } from '../../../lib/shared/strings';

interface Shown {
  readonly page: Page;
  readonly tab: string;
  attached: boolean;
  columns: number;
  rows: number;
}

interface Session {
  exited: boolean;
  folder?: string;
  counted?: boolean;
}

type ShownMessage = Extract<TerminalToHost, { readonly tab: string }>;

export class TerminalTool implements Tool<'terminal'> {
  private shell: ShellAccess = unattachedShell;
  private readonly link: HostLink;
  private readonly sessions = new Map<string, Session>();
  private readonly shown = new Map<Page, Shown>();
  private readonly recentFolders: RecentFolders;

  constructor(
    log: Log,
    connect: ConnectHost,
    private readonly settings: () => TerminalSettings,
    private readonly launch: (
      folder: string | undefined,
    ) => Promise<ShellLaunch>,
    private readonly windowsPty: WindowsPty | undefined,
    folders: FolderAccess,
  ) {
    this.link = new HostLink(connect, log, {
      event: (event) => this.received(event),
      stopped: () => this.stopped(),
    });
    this.recentFolders = new RecentFolders(folders, {
      log,
      pages: () => this.shell.pages(),
      recentFolders: () => this.shell.recentFolders(),
      open: (page, opened) => this.shell.open(page, 'terminal', opened, false),
      post: (page, message) => this.post(page, message),
    });
  }

  attach(shell: ShellAccess): void {
    this.shell = shell;
  }

  ready(page: Page): void {
    this.post(page, {
      type: 'settings',
      renderer: this.settings().renderer,
      scrollback: this.scrollback(),
      minimumContrastRatio: contrastRatio(this.settings().minimumContrastRatio),
      windowsPty: this.windowsPty,
    });
    this.recentFolders.post([page]);
  }

  show(page: Page, tab: Tab): Promise<void> {
    const before = this.shown.get(page);
    if (before !== undefined && before.tab !== tab.id) {
      this.link.send({ type: 'detach', id: before.tab }, false);
    }
    for (const [other, shown] of this.shown) {
      if (other !== page && shown.tab === tab.id) {
        this.link.send({ type: 'detach', id: tab.id }, false);
        this.shown.delete(other);
        this.post(other, { type: 'hide' });
      }
    }
    this.shown.set(page, {
      page,
      tab: tab.id,
      attached: false,
      columns: 0,
      rows: 0,
    });
    this.post(page, { type: 'show', tab: tab.id });
    return Promise.resolve();
  }

  shows(page: Page, tab: Tab): boolean {
    return this.shown.get(page)?.tab === tab.id;
  }

  hide(page: Page): void {
    const shown = this.shown.get(page);
    if (shown !== undefined) {
      this.link.send({ type: 'detach', id: shown.tab }, false);
      this.shown.delete(page);
      this.post(page, { type: 'hide' });
    }
  }

  preload(): Promise<void> {
    return Promise.resolve();
  }

  closed(_page: Page, tab: Tab): void {
    if (this.sessions.delete(tab.id)) {
      this.link.send({ type: 'kill', id: tab.id }, false);
    }
    for (const [page, shown] of this.shown) {
      if (shown.tab === tab.id) {
        this.shown.delete(page);
      }
    }
  }

  receive(page: Page, message: TerminalToHost): Promise<void> {
    switch (message.type) {
      case 'newTab':
        return this.newTab(page);
      case 'openFolder':
        return this.recentFolders.openListed(page, message.folder);
      case 'browseFolders':
        return this.recentFolders.browse(page);
      case 'forgetFolder':
        this.recentFolders.forget(message.folder);
        return Promise.resolve();
      default:
        return this.receiveShown(page, message);
    }
  }

  private receiveShown(page: Page, message: ShownMessage): Promise<void> {
    const shown = this.shown.get(page);
    if (shown === undefined || shown.tab !== message.tab) {
      return Promise.resolve();
    }
    const session = this.sessions.get(shown.tab);
    switch (message.type) {
      case 'open': {
        const size = sizeWithin(message.columns, message.rows);
        if (size !== undefined) {
          shown.columns = size.columns;
          shown.rows = size.rows;
          if (session === undefined) {
            this.spawn(shown);
          }
          this.attachTo(shown);
        }
        break;
      }
      case 'input':
        if (
          session?.exited === false &&
          typeof message.data === 'string' &&
          message.data.length <= maxInputLength
        ) {
          this.link.send({ type: 'input', id: shown.tab, data: message.data });
        }
        break;
      case 'resize': {
        const size = sizeWithin(message.columns, message.rows);
        if (size !== undefined) {
          shown.columns = size.columns;
          shown.rows = size.rows;
          if (session !== undefined) {
            this.link.send({ type: 'resize', id: shown.tab, ...size });
          }
        }
        break;
      }
      case 'ack':
        if (
          shown.attached &&
          session !== undefined &&
          Number.isSafeInteger(message.chars) &&
          message.chars > 0
        ) {
          this.link.send({ type: 'ack', id: shown.tab, chars: message.chars });
        }
        break;
      case 'restart':
        if (shown.attached && session?.exited !== false) {
          this.spawn(shown);
          if (session === undefined) {
            this.attachTo(shown);
          }
        }
        break;
      default:
        return Promise.resolve(message satisfies never);
    }
    return this.link.queued.get(shown.tab) ?? Promise.resolve();
  }

  refreshShown(): Promise<void> {
    return Promise.resolve();
  }

  names(tabs: readonly Tab[]): ReadonlyMap<string, TabName> {
    return new Map(
      tabs.map((tab) => [
        tab.id,
        {
          name:
            tab.root === undefined
              ? strings.tools.terminal
              : path.basename(tab.root) || tab.root,
        },
      ]),
    );
  }

  async fits(folder: string): Promise<boolean> {
    try {
      return (await fs.promises.stat(folder)).isDirectory();
    } catch {
      return false;
    }
  }

  folderOf(tab: Tab): string | undefined {
    return this.sessions.get(tab.id)?.folder;
  }

  visited(folder: string): void {
    this.recentFolders.visited(folder);
  }

  open(page: Page, folders: readonly string[]): Promise<void> {
    return this.recentFolders.open(page, folders);
  }

  newTab(page: Page): Promise<void> {
    return this.shell.open(page, 'terminal', [undefined], false);
  }

  reloadSettings(): void {
    this.recentFolders.post(this.shell.pages());
  }

  quit(): void {
    this.link.quit();
  }

  private spawn({ tab, columns, rows }: Shown): void {
    const root = this.shell.tabs().find((each) => each.id === tab)?.root;
    const session: Session = { exited: false };
    this.sessions.set(tab, session);
    this.link.sendWhen(tab, this.launch(root), (launch) =>
      this.sessions.get(tab) === session
        ? {
            type: 'spawn',
            id: tab,
            launch,
            columns,
            rows,
            scrollback: this.scrollback(),
          }
        : undefined,
    );
  }

  private scrollback(): number {
    return scrollbackLines(this.settings().scrollback);
  }

  private attachTo(shown: Shown): void {
    shown.attached = false;
    this.link.send({
      type: 'attach',
      id: shown.tab,
      columns: shown.columns,
      rows: shown.rows,
      scrollback: this.scrollback(),
    });
  }

  private received(event: HostEvent): void {
    const session = this.sessions.get(event.id);
    if (session === undefined) {
      return;
    }
    const shown = this.shownTab(event.id);
    switch (event.type) {
      case 'screen':
        session.exited = event.exited;
        if (shown !== undefined) {
          shown.attached = true;
          this.post(shown.page, {
            type: 'screen',
            tab: event.id,
            data: event.data,
            exited: event.exited,
          });
        }
        return;
      case 'output':
        if (shown?.attached) {
          this.post(shown.page, {
            type: 'output',
            tab: event.id,
            data: event.data,
          });
        }
        return;
      case 'folder':
        if (session.folder !== event.folder) {
          session.folder = event.folder;
          session.counted = false;
          this.shell.setRoot(event.id, event.folder);
        } else if (!session.counted) {
          session.counted = true;
          this.recentFolders.visited(event.folder);
        }
        return;
      case 'exited':
        session.exited = true;
        if (shown?.attached) {
          this.post(shown.page, { type: 'exited', tab: event.id });
        }
        return;
      default:
        return event satisfies never;
    }
  }

  private stopped(): void {
    this.sessions.clear();
    const data = `\r\n${strings.terminal.stopped}\r\n`;
    for (const shown of this.shown.values()) {
      if (shown.attached) {
        this.post(shown.page, { type: 'output', tab: shown.tab, data });
        this.post(shown.page, { type: 'exited', tab: shown.tab });
      } else {
        shown.attached = true;
        this.post(shown.page, {
          type: 'screen',
          tab: shown.tab,
          data,
          exited: true,
        });
      }
    }
  }

  private shownTab(tab: string): Shown | undefined {
    return [...this.shown.values()].find((shown) => shown.tab === tab);
  }

  private post(page: Page, message: TerminalToWebview): void {
    page.post({ type: 'tool', tool: 'terminal', message });
  }
}

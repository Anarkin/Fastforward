import * as fs from 'node:fs';
import * as path from 'node:path';
import type { HostCommand, HostEvent, ShellLaunch } from './hostProtocol';
import type { Log } from '../../../shell/main/log';
import {
  unattachedShell,
  type Page,
  type ShellAccess,
  type Tab,
  type TabName,
  type Tool,
} from '../../../shell/main/shell';
import {
  isSize,
  maxInputLength,
  type TerminalToHost,
  type TerminalToWebview,
  type WindowsPty,
} from '../shared/protocol';
import type { TerminalSettings } from '../shared/settings';
import { strings } from '../../../shared/strings';

export interface HostConnection {
  send(command: HostCommand): void;
  dispose(): void;
}

export interface HostListener {
  event(event: HostEvent): void;
  stopped(code: number): void;
}

export type ConnectHost = (listener: HostListener) => HostConnection;

interface Shown {
  readonly page: Page;
  readonly tab: string;
  attached: boolean;
  columns: number;
  rows: number;
}

interface Session {
  exited: boolean;
}

export class TerminalTool implements Tool<'terminal'> {
  private shell: ShellAccess = unattachedShell;
  private host: HostConnection | undefined;
  private readonly sessions = new Map<string, Session>();
  private shown: Shown | undefined;
  private quitting = false;

  constructor(
    private readonly log: Log,
    private readonly connect: ConnectHost,
    private readonly settings: () => TerminalSettings,
    private readonly launch: (folder: string | undefined) => ShellLaunch,
    private readonly windowsPty: WindowsPty | undefined,
  ) {}

  attach(shell: ShellAccess): void {
    this.shell = shell;
  }

  ready(page: Page): void {
    this.post(page, {
      type: 'settings',
      renderer: this.settings().renderer,
      windowsPty: this.windowsPty,
    });
  }

  show(page: Page, tab: Tab): Promise<void> {
    if (this.shown !== undefined && this.shown.tab !== tab.id) {
      this.host?.send({ type: 'detach', id: this.shown.tab });
    }
    this.shown = { page, tab: tab.id, attached: false, columns: 0, rows: 0 };
    this.post(page, { type: 'show', tab: tab.id });
    return Promise.resolve();
  }

  shows(page: Page, tab: Tab): boolean {
    return this.shown?.page === page && this.shown.tab === tab.id;
  }

  hide(page: Page): void {
    if (this.shown?.page === page) {
      this.host?.send({ type: 'detach', id: this.shown.tab });
      this.shown = undefined;
    }
  }

  preload(): Promise<void> {
    return Promise.resolve();
  }

  closed(_page: Page, tab: Tab): void {
    if (this.sessions.delete(tab.id)) {
      this.host?.send({ type: 'kill', id: tab.id });
    }
    if (this.shown?.tab === tab.id) {
      this.shown = undefined;
    }
  }

  receive(page: Page, message: TerminalToHost): Promise<void> {
    const shown = this.shown;
    if (
      shown === undefined ||
      shown.page !== page ||
      shown.tab !== message.tab
    ) {
      return Promise.resolve();
    }
    const session = this.sessions.get(shown.tab);
    switch (message.type) {
      case 'open':
        if (isSize(message.columns, message.rows)) {
          shown.columns = message.columns;
          shown.rows = message.rows;
          if (session === undefined) {
            this.spawn(shown);
          }
          this.attachTo(shown);
        }
        break;
      case 'input':
        if (
          session?.exited === false &&
          typeof message.data === 'string' &&
          message.data.length <= maxInputLength
        ) {
          this.send({ type: 'input', id: shown.tab, data: message.data });
        }
        break;
      case 'resize':
        if (isSize(message.columns, message.rows)) {
          shown.columns = message.columns;
          shown.rows = message.rows;
          if (session !== undefined) {
            this.send({
              type: 'resize',
              id: shown.tab,
              columns: message.columns,
              rows: message.rows,
            });
          }
        }
        break;
      case 'ack':
        if (
          shown.attached &&
          session !== undefined &&
          Number.isSafeInteger(message.chars) &&
          message.chars > 0
        ) {
          this.send({ type: 'ack', id: shown.tab, chars: message.chars });
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
    return Promise.resolve();
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

  open(page: Page, folders: readonly string[]): Promise<void> {
    return this.shell.open(page, 'terminal', folders, false);
  }

  newTab(page: Page): Promise<void> {
    return this.shell.open(page, 'terminal', [undefined], false);
  }

  reloadSettings(): void {}

  quit(): void {
    this.quitting = true;
    this.host?.dispose();
    this.host = undefined;
  }

  private spawn({ tab, columns, rows }: Shown): void {
    const root = this.shell.tabs().find((each) => each.id === tab)?.root;
    this.sessions.set(tab, { exited: false });
    this.send({
      type: 'spawn',
      id: tab,
      launch: this.launch(root),
      columns,
      rows,
    });
  }

  private attachTo(shown: Shown): void {
    shown.attached = false;
    this.send({
      type: 'attach',
      id: shown.tab,
      columns: shown.columns,
      rows: shown.rows,
    });
  }

  private send(command: HostCommand): void {
    this.host ??= this.connect({
      event: (event) => this.received(event),
      stopped: (code) => this.stopped(code),
    });
    this.host.send(command);
  }

  private received(event: HostEvent): void {
    const session = this.sessions.get(event.id);
    if (session === undefined) {
      return;
    }
    const shown = this.shown?.tab === event.id ? this.shown : undefined;
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

  private stopped(code: number): void {
    if (this.quitting) {
      return;
    }
    this.log.error(strings.log.terminalHostStopped(code));
    this.host = undefined;
    this.sessions.clear();
    const { shown } = this;
    if (shown === undefined) {
      return;
    }
    const data = `\r\n${strings.terminal.stopped}\r\n`;
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

  private post(page: Page, message: TerminalToWebview): void {
    page.post({ type: 'tool', tool: 'terminal', message });
  }
}

import * as fs from 'node:fs';
import * as path from 'node:path';
import { strings } from '../../../shared/strings';
import {
  unattachedShell,
  type Page,
  type ShellAccess,
  type Tab,
  type TabName,
  type Tool,
} from '../../../shell/main/shell';
import {
  isSide,
  parentFolder,
  sides,
  type CommanderToHost,
  type CommanderToWebview,
  type Entry,
  type Side,
} from '../shared/protocol';
import {
  isColumnWidths,
  type ColumnWidths,
  type CommanderSettings,
} from '../shared/settings';
import type { FileSystem } from './fileSystem';

export interface CommanderAccess {
  readonly fileSystem: () => Promise<FileSystem>;
  readonly settings: () => CommanderSettings;
  readonly dateFormat: () => string;
  readonly defaultColumns: () => ColumnWidths;
  readonly saveShowHidden: (shown: boolean) => Promise<void>;
  readonly saveColumns: (columns: ColumnWidths) => Promise<void>;
  readonly root: string;
}

interface Pane {
  folder: string;
  entries: readonly Entry[] | undefined;
  asked: number;
}

type Panes = Record<Side, Pane>;

interface ShownPane {
  readonly tab: string;
  readonly side: Side;
  readonly pane: Pane;
}

export function rootFolder(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
): string {
  return platform === 'win32' ? `${env.SystemDrive ?? 'C:'}\\` : '/';
}

function parentOf(folder: string): string | undefined {
  const parent = path.dirname(folder);
  return parent === folder ? undefined : parent;
}

function reasonOf(error: unknown): string {
  const code =
    error instanceof Error && 'code' in error ? error.code : undefined;
  switch (code) {
    case 'EACCES':
    case 'EPERM':
      return strings.commander.accessDenied;
    case 'ENOENT':
      return strings.commander.gone;
    default:
      return error instanceof Error ? error.message : String(error);
  }
}

async function isFolder(folder: string): Promise<boolean> {
  try {
    return (await fs.promises.stat(folder)).isDirectory();
  } catch {
    return false;
  }
}

export class CommanderTool implements Tool<'commander'> {
  private shell: ShellAccess = unattachedShell;
  private shown: { readonly page: Page; readonly tab: string } | undefined;
  private readonly panes = new Map<string, Panes>();
  private fileSystem: Promise<FileSystem> | undefined;

  constructor(private readonly access: CommanderAccess) {}

  attach(shell: ShellAccess): void {
    this.shell = shell;
  }

  ready(page: Page): void {
    this.postSettings(page);
  }

  async show(page: Page, tab: Tab): Promise<void> {
    this.shown = { page, tab: tab.id };
    this.post(page, { type: 'show', tab: tab.id });
    const panes = this.panes.get(tab.id) ?? (await this.start(tab));
    this.panes.set(tab.id, panes);
    await Promise.all([
      ...sides.map((side) =>
        this.list(page, tab.id, side, panes[side].folder, undefined),
      ),
      this.postDrives(page),
    ]);
  }

  shows(page: Page, tab: Tab): boolean {
    return this.shown?.page === page && this.shown.tab === tab.id;
  }

  hide(page: Page): void {
    if (this.shown?.page === page) {
      this.shown = undefined;
      this.post(page, { type: 'hide' });
    }
  }

  preload(): Promise<void> {
    return Promise.resolve();
  }

  closed(_page: Page, tab: Tab): void {
    this.panes.delete(tab.id);
    if (this.shown?.tab === tab.id) {
      this.shown = undefined;
    }
  }

  async receive(page: Page, message: CommanderToHost): Promise<void> {
    switch (message.type) {
      case 'open':
        return this.openEntry(page, message.tab, message.side, message.name);
      case 'drive':
        return this.drive(page, message.tab, message.side, message.drive);
      case 'listDrives':
        return this.postDrives(page);
      case 'columns':
        if (isColumnWidths(message.columns)) {
          const { extension, size, date } = message.columns;
          await this.access.saveColumns({ extension, size, date });
          this.postSettings(page);
        }
        return undefined;
      case 'showHidden':
        if (typeof message.shown === 'boolean') {
          await this.access.saveShowHidden(message.shown);
          this.postSettings(page);
        }
        return undefined;
      default:
        return message satisfies never;
    }
  }

  refreshShown(): Promise<void> {
    return Promise.resolve();
  }

  names(tabs: readonly Tab[]): ReadonlyMap<string, TabName> {
    return new Map(
      tabs.map((tab) => [tab.id, { name: strings.tools.commander }]),
    );
  }

  fits(folder: string): Promise<boolean> {
    return isFolder(folder);
  }

  folderOf(tab: Tab): string | undefined {
    return this.panes.get(tab.id)?.right.folder ?? tab.root;
  }

  visited(): void {}

  open(page: Page, folders: readonly string[]): Promise<void> {
    return this.shell.open(page, 'commander', folders, false);
  }

  newTab(page: Page): Promise<void> {
    return this.shell.open(page, 'commander', [undefined], false);
  }

  reloadSettings(): void {
    const page = this.shell.page();
    if (page !== undefined) {
      this.postSettings(page);
    }
  }

  quit(): void {}

  private async start(tab: Tab): Promise<Panes> {
    const { root } = this.access;
    const right =
      tab.root !== undefined && (await isFolder(tab.root))
        ? path.resolve(tab.root)
        : root;
    return {
      left: { folder: root, entries: undefined, asked: 0 },
      right: { folder: right, entries: undefined, asked: 0 },
    };
  }

  private shownPane(
    page: Page,
    tab: unknown,
    side: unknown,
  ): ShownPane | undefined {
    if (this.shown?.page !== page || this.shown.tab !== tab || !isSide(side)) {
      return undefined;
    }
    const pane = this.panes.get(this.shown.tab)?.[side];
    return pane && { tab: this.shown.tab, side, pane };
  }

  private openEntry(
    page: Page,
    tab: unknown,
    side: unknown,
    name: unknown,
  ): Promise<void> {
    const shown = this.shownPane(page, tab, side);
    if (shown === undefined || typeof name !== 'string') {
      return Promise.resolve();
    }
    const { folder, entries } = shown.pane;
    if (name === parentFolder) {
      const parent = parentOf(folder);
      return parent === undefined
        ? Promise.resolve()
        : this.list(page, shown.tab, shown.side, parent, path.basename(folder));
    }
    const entry = entries?.find((each) => each.name === name);
    return entry?.folder
      ? this.list(
          page,
          shown.tab,
          shown.side,
          path.join(folder, entry.name),
          undefined,
        )
      : Promise.resolve();
  }

  private async drive(
    page: Page,
    tab: unknown,
    side: unknown,
    drive: unknown,
  ): Promise<void> {
    const shown = this.shownPane(page, tab, side);
    if (shown === undefined) {
      return;
    }
    const drives = await (await this.files()).drives();
    const chosen = drives.find((each) => each === drive);
    if (chosen !== undefined) {
      await this.list(page, shown.tab, shown.side, chosen, undefined);
    }
  }

  private async list(
    page: Page,
    tab: string,
    side: Side,
    folder: string,
    selected: string | undefined,
  ): Promise<void> {
    const pane = this.panes.get(tab)?.[side];
    if (pane === undefined) {
      return;
    }
    const asked = ++pane.asked;
    let entries: readonly Entry[];
    try {
      entries = await (await this.files()).list(folder);
    } catch (error) {
      if (pane.asked === asked) {
        this.shell.notice(page, {
          level: 'error',
          message: strings.commander.couldNotOpen(folder, reasonOf(error)),
        });
        this.postListing(page, tab, side, pane, undefined);
      }
      return;
    }
    if (pane.asked !== asked) {
      return;
    }
    pane.folder = folder;
    pane.entries = entries;
    this.postListing(page, tab, side, pane, selected);
  }

  private postListing(
    page: Page,
    tab: string,
    side: Side,
    pane: Pane,
    selected: string | undefined,
  ): void {
    if (this.shown?.page === page && this.shown.tab === tab) {
      this.post(page, {
        type: 'listing',
        tab,
        side,
        folder: pane.folder,
        entries: pane.entries ?? [],
        parent: parentOf(pane.folder) !== undefined,
        selected,
      });
    }
  }

  private files(): Promise<FileSystem> {
    this.fileSystem ??= this.access.fileSystem();
    return this.fileSystem;
  }

  private async postDrives(page: Page): Promise<void> {
    this.post(page, {
      type: 'drives',
      drives: await (await this.files()).drives(),
    });
  }

  private postSettings(page: Page): void {
    const { showHidden, sort, columns } = this.access.settings();
    this.post(page, {
      type: 'settings',
      dateFormat: this.access.dateFormat(),
      showHidden,
      sort,
      columns,
      defaultColumns: this.access.defaultColumns(),
    });
  }

  private post(page: Page, message: CommanderToWebview): void {
    page.post({ type: 'tool', tool: 'commander', message });
  }
}

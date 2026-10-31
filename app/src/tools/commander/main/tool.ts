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
  isSort,
  type Sorts,
  type ColumnWidths,
  type CommanderSettings,
} from '../shared/settings';
import type { FileSystem } from './fileSystem';
import type { WatchFolder } from './watch';
import { Icons } from './icons';
import { iconSourceOf } from '../shared/icons';

export interface CommanderAccess {
  readonly fileSystem: () => Promise<FileSystem>;
  readonly settings: () => CommanderSettings;
  readonly defaultColumns: () => ColumnWidths;
  readonly saveShowHidden: (shown: boolean) => Promise<void>;
  readonly saveColumns: (columns: ColumnWidths) => Promise<void>;
  readonly saveSorts: (sorts: Sorts) => Promise<void>;
  readonly watch: WatchFolder;
  readonly fileIcon: (file: string) => Promise<Uint8Array>;
  readonly platform: NodeJS.Platform;
  readonly root: string;
}

interface Pane {
  folder: string;
  entries: readonly Entry[] | undefined;
  asked: number;
  history: readonly string[];
  at: number;
}

type Listing = 'visit' | 'show' | 'refresh' | { readonly at: number };

const maxHistory = 100;

function newPane(folder: string): Pane {
  return { folder, entries: undefined, asked: 0, history: [folder], at: 0 };
}

export function childToward(folder: string, from: string): string | undefined {
  const relative = path.relative(folder, from);
  return relative === '' ||
    relative.startsWith('..') ||
    path.isAbsolute(relative)
    ? undefined
    : relative.split(path.sep)[0];
}

type Panes = Record<Side, Pane> & { active: Side };

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

function codeOf(error: unknown): unknown {
  return error instanceof Error && 'code' in error ? error.code : undefined;
}

function isGone(error: unknown): boolean {
  const code = codeOf(error);
  return code === 'ENOENT' || code === 'ENOTDIR';
}

function isDenied(error: unknown): boolean {
  const code = codeOf(error);
  return code === 'EACCES' || code === 'EPERM';
}

function reasonOf(error: unknown): string {
  if (codeOf(error) === 'ENOENT') {
    return strings.commander.gone;
  }
  return error instanceof Error ? error.message : String(error);
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
  private readonly watching = new Map<
    Side,
    { readonly folder: string; readonly stop: () => void }
  >();
  private fileSystem: Promise<FileSystem> | undefined;
  private readonly icons: Icons;

  constructor(private readonly access: CommanderAccess) {
    this.icons = new Icons(access.fileIcon, access.platform);
  }

  attach(shell: ShellAccess): void {
    this.shell = shell;
  }

  ready(page: Page): void {
    this.postSettings(page);
  }

  async show(page: Page, tab: Tab): Promise<void> {
    this.unwatch();
    this.shown = { page, tab: tab.id };
    this.post(page, { type: 'show', tab: tab.id });
    const panes = this.panes.get(tab.id) ?? (await this.start(tab));
    this.panes.set(tab.id, panes);
    await Promise.all([
      ...sides.map((side) =>
        this.list(page, tab.id, side, panes[side].folder, 'show'),
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
      this.unwatch();
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
      this.unwatch();
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
      case 'step':
        return this.step(page, message.tab, message.side, message.step);
      case 'activate': {
        const shown = this.shownPane(page, message.tab, message.side);
        const panes = shown && this.panes.get(shown.tab);
        if (shown !== undefined && panes !== undefined) {
          panes.active = shown.side;
        }
        return undefined;
      }
      case 'columns':
        if (isColumnWidths(message.columns)) {
          const { extension, size, date } = message.columns;
          await this.access.saveColumns({ extension, size, date });
          this.postSettings(page);
        }
        return undefined;
      case 'sort':
        if (isSide(message.side) && isSort(message.sort)) {
          const { column, descending } = message.sort;
          await this.access.saveSorts({
            ...this.access.settings().sort,
            [message.side]: { column, descending },
          });
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
    const panes = this.panes.get(tab.id);
    return panes === undefined ? tab.root : panes[panes.active].folder;
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

  quit(): void {
    this.unwatch();
  }

  async icon(url: URL): Promise<Response> {
    const source = iconSourceOf(url);
    const pane = source && this.panes.get(source.tab)?.[source.side];
    const entry = pane?.entries?.find((each) => each.name === source?.name);
    if (
      source === undefined ||
      pane === undefined ||
      pane.folder !== source.folder ||
      entry === undefined ||
      entry.folder
    ) {
      return new Response(null, { status: 404 });
    }
    try {
      const png = await this.icons.of(path.join(pane.folder, entry.name));
      return new Response(Buffer.from(png), {
        headers: { 'content-type': 'image/png' },
      });
    } catch {
      return new Response(null, { status: 404 });
    }
  }

  private async start(tab: Tab): Promise<Panes> {
    const { root } = this.access;
    const right =
      tab.root !== undefined && (await isFolder(tab.root))
        ? path.resolve(tab.root)
        : root;
    return {
      left: newPane(root),
      right: newPane(right),
      active: 'right',
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
        : this.list(page, shown.tab, shown.side, parent, 'visit');
    }
    const entry = entries?.find((each) => each.name === name);
    return entry?.folder
      ? this.list(
          page,
          shown.tab,
          shown.side,
          path.join(folder, entry.name),
          'visit',
        )
      : Promise.resolve();
  }

  private step(
    page: Page,
    tab: unknown,
    side: unknown,
    step: unknown,
  ): Promise<void> {
    const shown = this.shownPane(page, tab, side);
    if (shown === undefined || (step !== -1 && step !== 1)) {
      return Promise.resolve();
    }
    const at = shown.pane.at + step;
    const folder = shown.pane.history.at(at);
    return at < 0 || folder === undefined
      ? Promise.resolve()
      : this.list(page, shown.tab, shown.side, folder, { at });
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
      await this.list(page, shown.tab, shown.side, chosen, 'visit');
    }
  }

  private async list(
    page: Page,
    tab: string,
    side: Side,
    folder: string,
    how: Listing,
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
      if (pane.asked !== asked) {
        return;
      }
      if (how !== 'refresh') {
        if (isDenied(error)) {
          this.post(page, { type: 'noAccess', folder });
        } else {
          this.shell.notice(page, {
            level: 'error',
            message: strings.commander.couldNotOpen(folder, reasonOf(error)),
          });
        }
        this.postListing(page, tab, side, pane, undefined);
      } else if (isGone(error)) {
        await this.list(
          page,
          tab,
          side,
          await this.nearestFolder(folder),
          'show',
        );
      }
      return;
    }
    if (pane.asked !== asked) {
      return;
    }
    const selected = childToward(folder, pane.folder);
    if (typeof how === 'object') {
      pane.at = how.at;
    } else if (how === 'visit' && pane.history[pane.at] !== folder) {
      const history = [...pane.history.slice(0, pane.at + 1), folder].slice(
        -maxHistory,
      );
      pane.history = history;
      pane.at = history.length - 1;
    }
    pane.folder = folder;
    pane.entries = entries;
    this.postListing(page, tab, side, pane, selected);
    this.watch(page, tab, side, folder);
  }

  private async nearestFolder(gone: string): Promise<string> {
    for (
      let folder = parentOf(gone);
      folder !== undefined;
      folder = parentOf(folder)
    ) {
      if (await isFolder(folder)) {
        return folder;
      }
    }
    return this.access.root;
  }

  private watch(page: Page, tab: string, side: Side, folder: string): void {
    if (this.shown?.page !== page || this.shown.tab !== tab) {
      return;
    }
    const current = this.watching.get(side);
    if (current?.folder === folder) {
      return;
    }
    current?.stop();
    this.watching.set(side, {
      folder,
      stop: this.access.watch(folder, () => {
        void this.list(page, tab, side, folder, 'refresh');
      }),
    });
  }

  private unwatch(): void {
    for (const { stop } of this.watching.values()) {
      stop();
    }
    this.watching.clear();
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
        back: pane.at > 0,
        forward: pane.at < pane.history.length - 1,
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

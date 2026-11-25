import type { TabNames } from './tabName';
import { viewVersion } from '../shared/protocol';
import * as path from 'node:path';
import { strings } from '../../../lib/shared/strings';
import {
  unattachedShell,
  type Page,
  type ShellAccess,
  type Tab,
  type TabName,
  type Tool,
} from '../../../shell/main/toolContract';
import type { SavedSides } from './savedSides';
import { type CommanderToHost } from '../shared/protocol';
import { sides } from '../shared/sides';
import type { LocalFileSystem } from './fileSystem';
import type { SettingsCommands } from './settingsCommands';
import type { Icons } from './icons';
import type { Transfers } from './transfers';
import { newPane, type Panes, type Sides } from './sides';
import { post } from './post';
import type { SideFlat } from './sideFlat';
import type { SideSizes } from './sideSizes';
import type { SideDuplicates } from './sideDuplicates';
import type { Serving } from './serving';
import type { ThumbnailServing } from './thumbnailServing';
import type { ArchiveCopies } from './archiveCopies';
import type { ArchivePasswords } from './archivePasswords';
import type { TransferCommands } from './transferCommands';
import type { CommanderAccess } from './access';
import { isFile, isFolder } from './fileStats';
import type { Listings } from './listings';
import type { Elevation } from './elevation';
import type { CommanderMessages } from './messages';
import { buildParts } from './parts';

export class CommanderTool implements Tool<'commander'> {
  readonly viewVersion = viewVersion;
  private shell: ShellAccess = unattachedShell;
  private readonly sides: Sides;
  private readonly flat: SideFlat;
  private readonly sizes: SideSizes;
  private readonly duplicates: SideDuplicates;
  private readonly serving: Serving;
  private readonly thumbnailServing: ThumbnailServing;
  private readonly passwords: ArchivePasswords;
  private readonly copies: ArchiveCopies;
  private readonly transferCommands: TransferCommands;
  private fileSystem: Promise<LocalFileSystem> | undefined;
  private readonly icons: Icons;
  private readonly transfers: Transfers;
  private readonly savedSides: SavedSides;
  private readonly tabNames: TabNames;
  private readonly listings: Listings;
  private readonly elevation: Elevation;
  private readonly settings: SettingsCommands;
  private readonly messages: CommanderMessages;

  constructor(private readonly access: CommanderAccess) {
    const parts = buildParts(
      access,
      () => this.shell,
      (saving) => this.saveQuietly(saving),
      () => this.files(),
      (page) => this.postDrives(page),
    );
    this.sides = parts.sides;
    this.flat = parts.flat;
    this.sizes = parts.sizes;
    this.duplicates = parts.duplicates;
    this.serving = parts.serving;
    this.thumbnailServing = parts.thumbnailServing;
    this.passwords = parts.passwords;
    this.copies = parts.copies;
    this.transferCommands = parts.transferCommands;
    this.icons = parts.icons;
    this.transfers = parts.transfers;
    this.savedSides = parts.savedSides;
    this.tabNames = parts.tabNames;
    this.listings = parts.listings;
    this.elevation = parts.elevation;
    this.settings = parts.settings;
    this.messages = parts.messages;
    access.whenGitFound?.(() => {
      for (const page of this.shell.pages()) {
        this.settings.post(page);
      }
    });
  }

  attach(shell: ShellAccess): void {
    this.shell = shell;
  }

  ready(page: Page): void {
    this.passwords.cancelPasswords(page);
    this.icons.forgetDropped();
    for (const pane of this.sides.allPanes()) {
      if (pane.flat !== undefined) {
        pane.flat.tree.resend();
        pane.flat.told = undefined;
      }
    }
    this.settings.post(page);
    this.transfers.resend();
    const open = new Set(
      this.shell
        .tabs()
        .filter((tab) => tab.tool === 'commander')
        .map((tab) => tab.id),
    );
    this.saveQuietly(this.savedSides.keep((tab) => open.has(tab)));
  }

  async show(page: Page, tab: Tab): Promise<void> {
    this.sides.stopShowing(page);
    for (const [other, showing] of this.sides.shown) {
      if (showing.tab === tab.id) {
        this.sides.stopShowing(other);
        post(other, { type: 'hide' });
      }
    }
    this.sides.shown.set(page, {
      tab: tab.id,
      watching: new Map(),
    });
    this.copies.askNextUpdate();
    post(page, { type: 'show', tab: tab.id });
    const started = this.sides.panes.get(tab.id);
    const archive =
      started === undefined ? await this.archiveOpenedWith(tab) : undefined;
    const panes = started ?? (await this.start(tab, archive));
    if (!this.shows(page, tab)) {
      return;
    }
    this.sides.panes.set(tab.id, panes);
    this.tabNames.changed(tab.id);
    await Promise.all([
      ...sides.map((side) =>
        this.listings.list(page, tab.id, side, panes[side].folder, 'show'),
      ),
      this.postDrives(page),
    ]);
    if (archive !== undefined && this.shows(page, tab)) {
      await this.receive(page, {
        type: 'enterArchive',
        tab: tab.id,
        side: 'right',
        folder: path.dirname(archive),
        name: path.basename(archive),
      });
    }
  }

  private async archiveOpenedWith(tab: Tab): Promise<string | undefined> {
    return this.savedSides.of(tab.id).right === undefined &&
      tab.root !== undefined &&
      (await isFile(tab.root))
      ? path.resolve(tab.root)
      : undefined;
  }

  shows(page: Page, tab: Tab): boolean {
    return this.sides.shown.get(page)?.tab === tab.id;
  }

  hide(page: Page): void {
    const shown = this.sides.shown.get(page);
    if (shown !== undefined) {
      this.sides.stopShowing(page);
      post(page, { type: 'hide' });
    }
  }

  preload(): Promise<void> {
    return Promise.resolve();
  }

  closed(page: Page, tab: Tab): void {
    post(page, { type: 'closed', tab: tab.id });
    const panes = this.sides.panes.get(tab.id);
    if (panes !== undefined) {
      for (const side of sides) {
        this.flat.endFlat(panes[side]);
        this.sizes.endSizing(panes[side]);
        this.duplicates.endDuplicates(panes[side]);
      }
    }
    this.sides.panes.delete(tab.id);
    this.tabNames.forget(tab.id);
    this.copies.letGoOfCopies();
    this.saveQuietly(this.savedSides.keep((kept) => kept !== tab.id));
    for (const [shownIn, showing] of this.sides.shown) {
      if (showing.tab === tab.id) {
        this.sides.stopShowing(shownIn);
      }
    }
  }

  receive(page: Page, message: CommanderToHost): Promise<void> {
    return this.messages.receive(page, message);
  }

  dropped(page: Page, files: unknown, message: unknown): Promise<void> {
    return this.transferCommands.dropped(page, files, message);
  }

  refreshShown(): Promise<void> {
    return Promise.resolve();
  }

  names(tabs: readonly Tab[]): ReadonlyMap<string, TabName> {
    return new Map(
      tabs.map((tab): [string, TabName] => [tab.id, this.tabNames.of(tab)]),
    );
  }

  fits(folder: string): Promise<boolean> {
    return isFolder(folder);
  }

  folderOf(tab: Tab): string | undefined {
    const panes = this.sides.panes.get(tab.id);
    if (panes === undefined) {
      return tab.root;
    }
    const { folder, archive } = panes[panes.active];
    return archive === undefined ? folder : path.dirname(archive);
  }

  visited(): void {}

  open(page: Page, folders: readonly string[]): Promise<void> {
    return this.shell.open(page, 'commander', folders, false);
  }

  newTab(page: Page): Promise<void> {
    return this.shell.open(page, 'commander', [undefined], false);
  }

  reloadSettings(): void {
    for (const page of this.shell.pages()) {
      this.settings.post(page);
    }
  }

  quitNote(): string | undefined {
    const notes = [
      ...(this.transfers.busy() ? [strings.commander.quitStopsTransfers] : []),
      ...(this.copies.updatesAsked.size > 0
        ? [strings.commander.quitDropsChanges]
        : []),
    ];
    return notes.length === 0 ? undefined : notes.join(' ');
  }

  quitWaits(): Promise<void> {
    return this.transfers.updatesEnded();
  }

  quit(): void {
    this.transfers.quit();
    for (const { stop } of this.copies.copiesWatched) {
      stop();
    }
    this.copies.copiesWatched.clear();
    for (const pane of this.sides.allPanes()) {
      this.flat.endFlat(pane);
    }
    for (const page of this.sides.shown.keys()) {
      this.sides.stopShowing(page);
    }
    this.elevation.close();
  }

  hiddenParts(file: string): Promise<readonly boolean[]> {
    return this.listings.hiddenParts(file);
  }

  viewClosed(file: string): void {
    this.copies.removeCopy(file);
  }

  viewedCopy(file: string): boolean {
    return this.copies.copyOf(file) !== undefined;
  }

  readOnlyCopy(file: string): boolean {
    return (
      this.copies.copyOf(file) !== undefined &&
      !this.copies.editedCopies.has(file)
    );
  }

  copySaved(file: string): void {
    this.copies.editedCopySaved(file);
  }

  icon(url: URL): Promise<Response> {
    return this.serving.icon(url);
  }

  thumbnail(url: URL): Promise<Response> {
    return this.thumbnailServing.thumbnail(url);
  }

  private async start(tab: Tab, archive: string | undefined): Promise<Panes> {
    const { root } = this.access;
    const saved = this.savedSides.of(tab.id);
    const right =
      saved.right ??
      (archive !== undefined
        ? path.dirname(archive)
        : tab.root !== undefined && (await isFolder(tab.root))
          ? path.resolve(tab.root)
          : root);
    return {
      left: newPane(saved.left ?? root),
      right: newPane(right),
      active: 'right',
    };
  }

  private saveQuietly(saving: Promise<void>): void {
    void this.shell.track(saving.catch(() => undefined));
  }

  private files(): Promise<LocalFileSystem> {
    this.fileSystem ??= this.access.fileSystem();
    return this.fileSystem;
  }

  private async postDrives(page: Page): Promise<void> {
    post(page, {
      type: 'drives',
      drives: await (await this.files()).drives(),
    });
  }
}

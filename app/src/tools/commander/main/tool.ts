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
import type { Editing } from './editing';
import type { SettingsCommands } from './settingsCommands';
import type { Icons } from './icons';
import type { Transfers } from './transfers';
import { viewerIconUrl } from '../shared/icons';
import { newPane, type Panes, type Sides } from './sides';
import { post } from './post';
import type { Viewers } from './viewers';
import type { SideFlat } from './sideFlat';
import type { SideSizes } from './sideSizes';
import type { SideDuplicates } from './sideDuplicates';
import type { Serving } from './serving';
import type { ThumbnailServing } from './thumbnailServing';
import type { ArchiveCopies } from './archiveCopies';
import type { ArchivePasswords } from './archivePasswords';
import type { TransferCommands } from './transferCommands';
import type { CommanderAccess } from './commanderAccess';
import { isFolder } from './fileStats';
import type { Listings } from './listings';
import type { Elevation } from './elevation';
import type { CommanderMessages } from './commanderMessages';
import { buildParts } from './commanderParts';
import { KeptCommanderTabs } from './keptCommanderTabs';

export class CommanderTool implements Tool<'commander'> {
  private shell: ShellAccess = unattachedShell;
  private readonly sides: Sides;
  private readonly viewers: Viewers;
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
  private readonly editing: Editing;
  private readonly listings: Listings;
  private readonly elevation: Elevation;
  private readonly settings: SettingsCommands;
  private readonly messages: CommanderMessages;
  private readonly kept = new KeptCommanderTabs(() => this.shell);

  constructor(private readonly access: CommanderAccess) {
    const parts = buildParts(
      access,
      () => this.shell,
      (saving) => this.saveQuietly(saving),
      () => this.files(),
      (page) => this.postDrives(page),
    );
    this.sides = parts.sides;
    this.viewers = parts.viewers;
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
    this.editing = parts.editing;
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
    this.kept.ready(page);
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
    const before = this.sides.shown.get(page)?.tab;
    if (before !== tab.id) {
      this.kept.leaving(page, before);
    }
    this.sides.stopShowing(page);
    for (const [other, showing] of this.sides.shown) {
      if (showing.tab === tab.id) {
        this.kept.leaving(other, tab.id);
        this.sides.stopShowing(other);
        post(other, { type: 'hide' });
      }
    }
    this.sides.shown.set(page, {
      tab: tab.id,
      watching: new Map(),
      viewingsAsked: 0,
    });
    this.copies.askNextUpdate();
    if (tab.edit === true && tab.root !== undefined) {
      post(page, {
        type: 'show',
        tab: tab.id,
        file: tab.root,
        edit: true,
        ...this.kept.handedTo(page, tab.id),
      });
      await this.editing.show(page, tab.id, tab.root);
      return;
    }
    if (tab.view === true && tab.root !== undefined) {
      post(page, {
        type: 'show',
        tab: tab.id,
        file: tab.root,
        ...this.kept.handedTo(page, tab.id),
      });
      await this.viewers.startViewing(page, tab.id, tab.root);
      return;
    }
    post(page, {
      type: 'show',
      tab: tab.id,
      ...this.kept.handedTo(page, tab.id),
    });
    const panes = this.sides.panes.get(tab.id) ?? (await this.start(tab));
    if (!this.shows(page, tab)) {
      return;
    }
    this.sides.panes.set(tab.id, panes);
    await Promise.all([
      ...sides.map((side) =>
        this.listings.list(page, tab.id, side, panes[side].folder, 'show'),
      ),
      this.postDrives(page),
    ]);
  }

  shows(page: Page, tab: Tab): boolean {
    return this.sides.shown.get(page)?.tab === tab.id;
  }

  hide(page: Page): void {
    const shown = this.sides.shown.get(page);
    if (shown !== undefined) {
      this.kept.leaving(page, shown.tab);
      this.sides.stopShowing(page);
      post(page, { type: 'hide' });
    }
  }

  preload(): Promise<void> {
    return Promise.resolve();
  }

  closed(page: Page, tab: Tab): void {
    post(page, { type: 'closed', tab: tab.id });
    this.kept.closed(tab.id);
    const panes = this.sides.panes.get(tab.id);
    if (panes !== undefined) {
      for (const side of sides) {
        this.flat.endFlat(panes[side]);
        this.sizes.endSizing(panes[side]);
        this.duplicates.endDuplicates(panes[side]);
      }
    }
    this.sides.panes.delete(tab.id);
    this.copies.letGoOfCopies();
    this.saveQuietly(this.savedSides.keep((kept) => kept !== tab.id));
    for (const [shownIn, showing] of this.sides.shown) {
      if (showing.tab === tab.id) {
        this.sides.stopShowing(shownIn);
      }
    }
    if (tab.view === true && tab.root !== undefined) {
      this.copies.removeCopy(tab.root);
    }
    if (tab.edit === true) {
      this.editing.closed(tab.id);
    }
  }

  receive(page: Page, message: CommanderToHost): Promise<void> {
    if (message.type === 'keepTab') {
      this.kept.keep(page, message.tab, message.kept);
      return Promise.resolve();
    }
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
      tabs.map((tab): [string, TabName] => [
        tab.id,
        (tab.view === true || tab.edit === true) && tab.root !== undefined
          ? {
              name: path.basename(tab.root),
              icon: viewerIconUrl(tab.id, tab.root),
              ...(tab.edit === true &&
                this.editing.unsaved(tab.id) && { unsaved: true }),
            }
          : { name: strings.tools.commander },
      ]),
    );
  }

  fits(folder: string): Promise<boolean> {
    return isFolder(folder);
  }

  folderOf(tab: Tab): string | undefined {
    if ((tab.view === true || tab.edit === true) && tab.root !== undefined) {
      return path.dirname(tab.root);
    }
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

  unsaved(tab: Tab): boolean {
    return tab.edit === true && this.editing.unsaved(tab.id);
  }

  saveUnsaved(page: Page, tab: Tab): Promise<boolean> {
    return tab.edit === true
      ? this.editing.save(page, tab.id)
      : Promise.resolve(true);
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

  file(url: URL, range: string | null): Promise<Response> {
    return this.serving.file(url, range);
  }

  icon(url: URL): Promise<Response> {
    return this.serving.icon(url);
  }

  thumbnail(url: URL): Promise<Response> {
    return this.thumbnailServing.thumbnail(url);
  }

  private async start(tab: Tab): Promise<Panes> {
    const { root } = this.access;
    const saved = this.savedSides.of(tab.id);
    const right =
      saved.right ??
      (tab.root !== undefined && (await isFolder(tab.root))
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

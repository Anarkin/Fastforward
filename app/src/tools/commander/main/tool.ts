import * as path from 'node:path';
import { strings } from '../../../lib/shared/strings';
import type { Sentence } from '../../../lib/shared/sentences';
import {
  unattachedShell,
  type Page,
  type ShellAccess,
  type Tab,
  type TabName,
  type Tool,
} from '../../../shell/main/toolContract';
import { SavedSides } from './savedSides';
import { sides, type CommanderToHost } from '../shared/protocol';
import type { LocalFileSystem } from './fileSystem';
import { Editing } from './editing';
import { editingFiles } from './editingFiles';
import { CommanderSettings } from './commanderSettings';
import { Icons } from './icons';
import { Transfers } from './transfers';
import { maxDroppedIcons, viewerIconUrl } from '../shared/icons';
import { newPane, type Panes, Sides } from './sides';
import { post } from './post';
import { Viewers } from './viewers';
import { SideFlat } from './sideFlat';
import { SideSizes } from './sideSizes';
import { SideDuplicates } from './sideDuplicates';
import { Serving } from './serving';
import { ThumbnailServing } from './thumbnailServing';
import { ArchiveCopies } from './archiveCopies';
import { ArchivePasswords } from './archivePasswords';
import { ArchiveCommands } from './archiveCommands';
import { TransferCommands } from './transferCommands';
import { PackCommands } from './packCommands';
import type { CommanderAccess } from './commanderAccess';
import { isFolder } from './fileStats';
import { FileCommands } from './fileCommands';
import { ItemChanges } from './itemChanges';
import { SystemCommands } from './systemCommands';
import { ArchiveListing } from './archiveListing';
import { Listings } from './listings';
import { Navigation } from './navigation';
import { SideRepositories } from './sideRepositories';
import { Elevation } from './elevation';

export class CommanderTool implements Tool<'commander'> {
  private shell: ShellAccess = unattachedShell;
  private readonly sides = new Sides();
  private readonly viewers: Viewers;
  private readonly flat: SideFlat;
  private readonly sizes: SideSizes;
  private readonly duplicates: SideDuplicates;
  private readonly serving: Serving;
  private readonly thumbnailServing: ThumbnailServing;
  private readonly passwords: ArchivePasswords;
  private readonly copies: ArchiveCopies;
  private readonly archiveCommands: ArchiveCommands;
  private readonly transferCommands: TransferCommands;
  private readonly packCommands: PackCommands;
  private readonly fileCommands: FileCommands;
  private readonly itemChanges: ItemChanges;
  private readonly systemCommands: SystemCommands;
  private readonly archiveListing: ArchiveListing;
  private fileSystem: Promise<LocalFileSystem> | undefined;
  private readonly icons: Icons;
  private transferPage: Page | undefined;
  private readonly transfers: Transfers;
  private readonly savedSides: SavedSides;
  private readonly editing: Editing;
  private readonly listings: Listings;
  private readonly navigation: Navigation;
  private readonly elevation: Elevation;
  private readonly settings: CommanderSettings;

  constructor(private readonly access: CommanderAccess) {
    this.icons = new Icons(access.fileIcon, access.platform);
    this.viewers = new Viewers(access, this.sides, (file) =>
      this.listings.hiddenParts(file),
    );
    this.flat = new SideFlat(access, this.sides, {
      listed: (folder) => this.listings.listed(folder),
      postListing: (page, tab, side, pane, selected) =>
        this.listings.postListing(page, tab, side, pane, selected),
      list: (page, tab, side, folder, how) =>
        this.listings.list(page, tab, side, folder, how),
      endSizing: (pane) => this.sizes.endSizing(pane),
      flatRead: (pane) => this.duplicates.feedDuplicates(pane),
    });
    this.sizes = new SideSizes(access, this.sides, {
      listed: (folder) => this.listings.listed(folder),
    });
    this.duplicates = new SideDuplicates(access, this.sides, {
      postListing: (page, tab, side, pane, selected) =>
        this.listings.postListing(page, tab, side, pane, selected),
    });
    this.serving = new Serving(this.sides, this.icons, () => this.shell.tabs());
    this.thumbnailServing = new ThumbnailServing(access, this.sides);
    this.editing = new Editing(
      editingFiles(access, () => this.copies),
      {
        post: (page, message) => post(page, message),
        notice: (page, notice) => this.shell.notice(page, notice),
        namesChanged: (page) => this.shell.postTabs(page),
        pagesShowing: (tab) =>
          [...this.sides.shown]
            .filter(([, showing]) => showing.tab === tab)
            .map(([page]) => page),
        openEdit: (page, file) => this.shell.openEdit(page, 'commander', file),
      },
    );
    this.savedSides = new SavedSides(access.store);
    this.transfers = new Transfers(access.connectTransfer, {
      show: (view) => {
        const kept = this.transferPage;
        const page =
          kept === undefined || kept.disposed ? this.shell.page() : kept;
        this.transferPage = view === undefined ? undefined : page;
        if (page !== undefined) {
          post(page, { type: 'transfer', view });
        }
      },
      notice: (notice) => this.shell.notice(undefined, notice),
      finished: (ask) => this.transferCommands.transferred(ask),
    });
    this.passwords = new ArchivePasswords(access);
    this.copies = new ArchiveCopies(
      access,
      this.sides,
      this.passwords,
      this.editing,
      this.transfers,
      {
        shell: () => this.shell,
        refuse: (page, message) => this.refuse(page, message),
        saveQuietly: (saving) => this.saveQuietly(saving),
      },
    );
    this.archiveCommands = new ArchiveCommands(access, this.transfers, {
      shell: () => this.shell,
      refuse: (page, message) => this.refuse(page, message),
    });
    this.transferCommands = new TransferCommands(
      access,
      this.sides,
      this.passwords,
      this.archiveCommands,
      this.transfers,
      {
        shell: () => this.shell,
        refuse: (page, message) => this.refuse(page, message),
        list: (page, tab, side, folder, how, fallback, selecting) =>
          this.listings.list(page, tab, side, folder, how, fallback, selecting),
      },
    );
    this.packCommands = new PackCommands(
      access,
      this.sides,
      this.passwords,
      this.transfers,
      {
        shell: () => this.shell,
        refuse: (page, message) => this.refuse(page, message),
      },
    );
    this.fileCommands = new FileCommands(
      access,
      this.sides,
      this.copies,
      this.editing,
      {
        shell: () => this.shell,
        list: (...listed) => this.listings.list(...listed),
      },
    );
    this.itemChanges = new ItemChanges(
      access,
      this.sides,
      this.archiveCommands,
      {
        shell: () => this.shell,
        list: (...listed) => this.listings.list(...listed),
      },
    );
    this.systemCommands = new SystemCommands(access, this.sides, this.copies, {
      shell: () => this.shell,
    });
    this.archiveListing = new ArchiveListing(
      access,
      this.sides,
      this.passwords,
      {
        refuse: (page, message) => this.refuse(page, message),
        list: (page, tab, side, folder, how, fallback, selecting) =>
          this.listings.list(page, tab, side, folder, how, fallback, selecting),
      },
    );
    this.listings = new Listings(
      access,
      this.sides,
      {
        archiveListing: this.archiveListing,
        flat: this.flat,
        sizes: this.sizes,
        duplicates: this.duplicates,
        copies: this.copies,
        savedSides: this.savedSides,
        repositories: new SideRepositories(access, this.sides),
      },
      {
        shell: () => this.shell,
        elevated: () => this.elevation.current,
        files: () => this.files(),
        saveQuietly: (saving) => this.saveQuietly(saving),
      },
    );
    this.navigation = new Navigation(access, this.sides, {
      list: (...listed) => this.listings.list(...listed),
      files: () => this.files(),
    });
    this.elevation = new Elevation(access, this.sides, this.listings, {
      shell: () => this.shell,
    });
    this.settings = new CommanderSettings(access, this.sides);
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
      viewingsAsked: 0,
    });
    this.copies.askNextUpdate();
    if (tab.edit === true && tab.root !== undefined) {
      post(page, {
        type: 'show',
        tab: tab.id,
        file: tab.root,
        edit: true,
      });
      await this.editing.show(page, tab.id, tab.root);
      return;
    }
    if (tab.view === true && tab.root !== undefined) {
      post(page, { type: 'show', tab: tab.id, file: tab.root });
      await this.viewers.startViewing(page, tab.id, tab.root);
      return;
    }
    post(page, { type: 'show', tab: tab.id });
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
    if (this.sides.shown.has(page)) {
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

  async receive(page: Page, message: CommanderToHost): Promise<void> {
    switch (message.type) {
      case 'editFile':
        return this.fileCommands.editFile(
          page,
          this.sides.namingPane(
            page,
            message.tab,
            message.side,
            message.folder,
          ),
          message.name,
        );
      case 'readEdited':
      case 'editText':
      case 'editState':
      case 'saveText':
      case 'reloadEdited':
      case 'saveIn':
      case 'reopenIn':
      case 'editSource':
        return this.editing.receive(page, message);
      case 'open':
        return this.fileCommands.openEntry(
          page,
          this.sides.namingPane(
            page,
            message.tab,
            message.side,
            message.folder,
          ),
          message.name,
        );
      case 'drive':
        return this.navigation.drive(
          page,
          message.tab,
          message.side,
          message.drive,
        );
      case 'listDrives':
        return this.postDrives(page);
      case 'step':
        return this.navigation.step(
          page,
          message.tab,
          message.side,
          message.step,
        );
      case 'view':
        return this.fileCommands.view(
          page,
          this.sides.namingPane(
            page,
            message.tab,
            message.side,
            message.folder,
          ),
          message.name,
        );
      case 'shellMenu':
        return this.systemCommands.shellMenu(page, message);
      case 'delete':
        return this.itemChanges.delete(page, message);
      case 'transfer':
        return this.transferCommands.transfer(page, message);
      case 'newFolder':
        return this.itemChanges.newFolder(page, message);
      case 'newFile':
        return this.fileCommands.newFile(page, message);
      case 'editViewed':
        return this.fileCommands.editViewed(page, message);
      case 'rename':
        return this.itemChanges.rename(page, message);
      case 'pack':
        return this.packCommands.pack(page, message);
      case 'testArchives':
        this.packCommands.testArchives(page, message);
        return undefined;
      case 'copyToClipboard':
        return this.systemCommands.copyToClipboard(page, message);
      case 'drag':
        return this.systemCommands.drag(page, message);
      case 'paste':
        return this.transferCommands.paste(page, message);
      case 'answerClash':
        this.transfers.answer(
          message.transfer,
          message.asked,
          message.answer,
          message.all,
        );
        return undefined;
      case 'stopTransfer':
        this.transfers.stop(message.transfer);
        return undefined;
      case 'hideTransfer':
        this.transfers.hide(message.transfer);
        return undefined;
      case 'compare':
        return this.fileCommands.compare(page, message.tab, message.files);
      case 'readRows':
        return this.viewers.readRows(page, message);
      case 'readText':
        return this.viewers.readText(page, message);
      case 'findText':
        return this.viewers.findText(page, message);
      case 'stopFind':
        this.viewers.stopFind(page, message);
        return undefined;
      case 'readPdfPlace':
        return this.viewers.readPdfPlace(page, message);
      case 'savePdfPlace':
        return this.viewers.savePdfPlace(page, message);
      case 'readBytes':
        return this.viewers.readBytes(page, message);
      case 'reread':
        return this.listings.reread(page, message);
      case 'flat':
        return this.flat.turnFlat(page, message);
      case 'stopReading':
        this.listings.stopReading(page, message);
        return undefined;
      case 'countSizes':
        this.sizes.countSizes(page, message);
        return undefined;
      case 'openOnSide':
        return this.archiveListing.openOnSide(page, message);
      case 'enterArchive':
        return this.archiveListing.enterArchive(page, message);
      case 'password':
        this.passwords.answerPassword(message.ask, message.password);
        return undefined;
      case 'updateArchive':
        this.copies.answerUpdate(message.ask, message.update);
        return undefined;
      case 'openRepository':
        return this.fileCommands.openRepository(page, message);
      case 'folderCommand':
        return this.fileCommands.folderCommand(page, message);
      case 'elevate':
        return this.elevation.elevate(page, message.tab, message.side);
      case 'activate': {
        const shown = this.sides.shownPane(page, message.tab, message.side);
        const panes = shown && this.sides.panes.get(shown.tab);
        if (shown !== undefined && panes !== undefined) {
          panes.active = shown.side;
        }
        return undefined;
      }
      case 'columns':
        return this.settings.columns(page, message);
      case 'sort':
        return this.settings.sort(page, message);
      case 'saveThumbnail':
        return this.thumbnailServing.saveThumbnail(message);
      case 'dropIcons':
        if (
          Array.isArray(message.tickets) &&
          message.tickets.length <= maxDroppedIcons &&
          message.tickets.every((ticket) => typeof ticket === 'string')
        ) {
          this.icons.drop(message.tickets);
        }
        return undefined;
      case 'showHidden':
        return this.settings.showHidden(page, message);
      case 'addBookmark':
        return this.settings.addBookmark(page, message);
      case 'removeBookmark':
        return this.settings.removeBookmark(page, message);
      case 'goToBookmark':
        return this.navigation.goToBookmark(page, message);
      case 'goTo':
        return this.navigation.goTo(page, message);
      case 'duplicates':
        this.duplicates.turnDuplicates(page, message);
        return undefined;
      default:
        return message satisfies never;
    }
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

  private refuse(page: Page, message: Sentence): void {
    this.shell.notice(page, { level: 'error', message });
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

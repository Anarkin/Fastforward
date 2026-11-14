import * as fs from 'node:fs';
import * as path from 'node:path';
import { strings, type Sentence } from '../../../lib/shared/strings';
import {
  unattachedShell,
  type Page,
  type ShellAccess,
  type Tab,
  type TabName,
  type Tool,
} from '../../../shell/main/shell';
import { SavedSides } from './savedSides';
import { isSide, sides, type CommanderToHost } from '../shared/protocol';
import { heldColumns, isColumnWidths, isSort } from '../shared/settings';
import type { LocalFileSystem } from './fileSystem';
import {
  shownBookmarks,
  withBookmark,
  withoutBookmark,
  type BookmarkSystem,
} from './bookmarks';
import { heldBox } from '../../../lib/shared/images';
import { fileVersion } from '../shared/files';
import { firstBytes } from './textRows';
import { Editing } from './editing';
import { saveFile } from './fileSaving';
import { Icons } from './icons';
import { codeOf } from './reasons';
import { Transfers } from './transfers';
import { maxDroppedIcons, viewerIconUrl } from '../shared/icons';
import { newPane, type Panes, Sides, post } from './sides';
import { Viewers } from './viewers';
import { SideScans } from './sideScans';
import { Serving } from './serving';
import { ArchiveCopies } from './archiveCopies';
import { TransferCommands } from './transferCommands';
import { PackCommands } from './packCommands';
import type { CommanderAccess } from './commanderAccess';
import { isFolder } from './fileStats';
import { FileCommands } from './fileCommands';
import { ArchiveListing } from './archiveListing';
import { Listings } from './listings';
import { Elevation } from './elevation';

export class CommanderTool implements Tool<'commander'> {
  private shell: ShellAccess = unattachedShell;
  private readonly sides = new Sides();
  private readonly viewers: Viewers;
  private readonly scans: SideScans;
  private readonly serving: Serving;
  private readonly copies: ArchiveCopies;
  private readonly transferCommands: TransferCommands;
  private readonly packCommands: PackCommands;
  private readonly fileCommands: FileCommands;
  private readonly archiveListing: ArchiveListing;
  private fileSystem: Promise<LocalFileSystem> | undefined;
  private readonly icons: Icons;
  private transferPage: Page | undefined;
  private readonly transfers: Transfers;
  private readonly savedSides: SavedSides;
  private readonly editing: Editing;
  private readonly listings: Listings;
  private readonly elevation: Elevation;

  constructor(private readonly access: CommanderAccess) {
    this.icons = new Icons(access.fileIcon, access.platform);
    this.viewers = new Viewers(access, this.sides, (file) =>
      this.listings.hiddenParts(file),
    );
    this.scans = new SideScans(access, this.sides, {
      listed: (folder) => this.listings.listed(folder),
      postListing: (page, tab, side, pane, selected) =>
        this.listings.postListing(page, tab, side, pane, selected),
      list: (page, tab, side, folder, how) =>
        this.listings.list(page, tab, side, folder, how),
    });
    this.serving = new Serving(access, this.sides, this.icons, () =>
      this.shell.tabs(),
    );
    this.editing = new Editing(
      {
        readFile: (file) => fs.promises.readFile(file),
        readStart: firstBytes,
        statFile: async (file) => {
          try {
            const stat = await fs.promises.stat(file);
            return { folder: stat.isDirectory(), size: stat.size };
          } catch (error) {
            if (codeOf(error) === 'ENOENT') {
              return undefined;
            }
            throw error;
          }
        },
        stampOf: async (file) => {
          try {
            return fileVersion(await fs.promises.stat(file));
          } catch (error) {
            if (codeOf(error) === 'ENOENT') {
              return undefined;
            }
            throw error;
          }
        },
        watch: (file, onChange) => access.watch(file, onChange),
        saveFile: async (file, bytes, overwriteReadOnly) => {
          const saved = await (
            access.saveEdited ??
            ((edited, written, overwriting) =>
              saveFile(edited, written, {
                overwriteReadOnly: overwriting,
              }))
          )(file, bytes, overwriteReadOnly);
          this.copies.editedCopySaved(file);
          return saved;
        },
        codePage: () => access.codePage(),
        readOnly: (file) =>
          access.readOnlyFile?.(file) === true ||
          (this.copies.copyOf(file) !== undefined &&
            !this.copies.editedCopies.has(file)),
        ...(access.editorSources !== undefined && {
          endingSources: access.editorSources,
        }),
        ...(access.editorDefaults !== undefined && {
          textDefaults: access.editorDefaults,
        }),
      },
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
    this.copies = new ArchiveCopies(
      access,
      this.sides,
      this.editing,
      this.transfers,
      {
        shell: () => this.shell,
        refuse: (page, message) => this.refuse(page, message),
        saveQuietly: (saving) => this.saveQuietly(saving),
      },
    );
    this.transferCommands = new TransferCommands(
      access,
      this.sides,
      this.copies,
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
      this.copies,
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
        list: (page, tab, side, folder, how, fallback, selecting) =>
          this.listings.list(page, tab, side, folder, how, fallback, selecting),
      },
    );
    this.archiveListing = new ArchiveListing(access, this.sides, this.copies, {
      refuse: (page, message) => this.refuse(page, message),
      list: (page, tab, side, folder, how, fallback, selecting) =>
        this.listings.list(page, tab, side, folder, how, fallback, selecting),
    });
    this.listings = new Listings(
      access,
      this.sides,
      {
        archiveListing: this.archiveListing,
        scans: this.scans,
        copies: this.copies,
        savedSides: this.savedSides,
      },
      {
        shell: () => this.shell,
        elevated: () => this.elevation.current,
        files: () => this.files(),
        saveQuietly: (saving) => this.saveQuietly(saving),
      },
    );
    this.elevation = new Elevation(access, this.sides, this.listings, {
      shell: () => this.shell,
    });
  }

  attach(shell: ShellAccess): void {
    this.shell = shell;
  }

  ready(page: Page): void {
    this.copies.cancelPasswords(page);
    this.icons.forgetDropped();
    for (const pane of this.sides.allPanes()) {
      if (pane.flat !== undefined) {
        pane.flat.tree.resend();
        pane.flat.told = undefined;
      }
    }
    this.postSettings(page);
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
        this.scans.endFlat(panes[side]);
        this.scans.endSizing(panes[side]);
        this.scans.endDuplicates(panes[side]);
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
        return this.listings.drive(
          page,
          message.tab,
          message.side,
          message.drive,
        );
      case 'listDrives':
        return this.postDrives(page);
      case 'step':
        return this.listings.step(
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
        return this.fileCommands.shellMenu(page, message);
      case 'delete':
        return this.fileCommands.delete(page, message);
      case 'transfer':
        return this.transferCommands.transfer(page, message);
      case 'newFolder':
        return this.fileCommands.newFolder(page, message);
      case 'newFile':
        return this.fileCommands.newFile(page, message);
      case 'editViewed':
        return this.fileCommands.editViewed(page, message);
      case 'rename':
        return this.fileCommands.rename(page, message);
      case 'pack':
        return this.packCommands.pack(page, message);
      case 'testArchives':
        this.packCommands.testArchives(page, message);
        return undefined;
      case 'copyToClipboard':
        return this.fileCommands.copyToClipboard(page, message);
      case 'drag':
        return this.fileCommands.drag(page, message);
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
      case 'stopFind': {
        const showing = this.sides.shown.get(page);
        if (
          showing?.findingRequest !== undefined &&
          message.request === showing.findingRequest &&
          message.tab === showing.viewing?.tab
        ) {
          showing.finding?.abort();
          showing.finding = undefined;
          showing.findingRequest = undefined;
        }
        return;
      }
      case 'readPdfPlace':
        return this.viewers.readPdfPlace(page, message);
      case 'savePdfPlace':
        return this.viewers.savePdfPlace(page, message);
      case 'readBytes':
        return this.viewers.readBytes(page, message);
      case 'reread': {
        const shown = this.sides.shownPane(page, message.tab, message.side);
        if (shown !== undefined) {
          this.scans.endSizing(shown.pane);
          shown.pane.duplicates?.duplicates.forget();
        }
        if (shown?.pane.flat !== undefined) {
          this.scans.startFlat(page, shown);
          return undefined;
        }
        return shown === undefined
          ? undefined
          : this.listings.list(
              page,
              shown.tab,
              shown.side,
              shown.pane.folder,
              'show',
            );
      }
      case 'flat':
        return this.scans.turnFlat(page, message);
      case 'stopReading': {
        const shown = this.sides.shownPane(page, message.tab, message.side);
        shown?.pane.opening?.abort();
        shown?.pane.flat?.tree.stop();
        shown?.pane.sizing?.sizes.stop();
        shown?.pane.duplicates?.duplicates.stop();
        return undefined;
      }
      case 'countSizes':
        this.scans.countSizes(page, message);
        return undefined;
      case 'openOnSide':
        return this.archiveListing.openOnSide(page, message);
      case 'enterArchive':
        return this.archiveListing.enterArchive(page, message);
      case 'password':
        this.copies.answerPassword(message.ask, message.password);
        return undefined;
      case 'updateArchive':
        this.copies.answerUpdate(message.ask, message.update);
        return undefined;
      case 'openRepository':
        return this.openRepository(page, message);
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
        if (isColumnWidths(message.columns)) {
          const { extension, size, date } = message.columns;
          await this.access.saveColumns({ extension, size, date });
          this.postSettings(page);
        }
        return undefined;
      case 'sort':
        if (isSide(message.side) && isSort(message.sort)) {
          const { column, descending, groupByColor } = message.sort;
          await this.access.saveSorts({
            ...this.access.settings().sort,
            [message.side]: { column, descending, groupByColor },
          });
          this.postSettings(page);
        }
        return undefined;
      case 'saveThumbnail':
        return this.serving.saveThumbnail(message);
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
        if (typeof message.shown === 'boolean') {
          await this.access.saveShowHidden(message.shown);
          this.postSettings(page);
        }
        return undefined;
      case 'addBookmark': {
        const shown = this.sides.diskPane(
          page,
          message.tab,
          message.side,
          message.folder,
        );
        return shown === undefined
          ? undefined
          : this.saveBookmarks(page, (stored, system) =>
              withBookmark(stored, shown.pane.folder, system),
            );
      }
      case 'removeBookmark': {
        const { folder } = message;
        return typeof folder === 'string'
          ? this.saveBookmarks(page, (stored, system) =>
              withoutBookmark(stored, folder, system),
            )
          : undefined;
      }
      case 'goToBookmark':
        return this.listings.goToBookmark(page, message);
      case 'goTo':
        return this.listings.goTo(page, message);
      case 'duplicates':
        this.scans.turnDuplicates(page, message);
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
      this.postSettings(page);
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
      this.scans.endFlat(pane);
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
    return this.serving.thumbnail(url);
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

  private openRepository(
    page: Page,
    {
      tab,
      side,
      folder,
      name,
    }: Extract<CommanderToHost, { type: 'openRepository' }>,
  ): Promise<void> {
    const shown = this.sides.diskPane(page, tab, side, folder);
    return shown === undefined ||
      typeof name !== 'string' ||
      !shown.pane.repositories.has(name)
      ? Promise.resolve()
      : this.shell.openFolders(page, 'git', [
          path.join(shown.pane.folder, name),
        ]);
  }

  private get bookmarkSystem(): BookmarkSystem {
    return { paths: path, platform: this.access.platform };
  }

  private async saveBookmarks(
    page: Page,
    change: (
      stored: readonly string[],
      system: BookmarkSystem,
    ) => readonly string[],
  ): Promise<void> {
    const stored = this.access.settings().bookmarks;
    const changed = change(stored, this.bookmarkSystem);
    if (changed !== stored) {
      await this.access.saveBookmarks(changed);
      this.postSettings(page);
    }
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

  private postSettings(page: Page): void {
    const { showHidden, sort, columns, thumbnailSize, fileColors, bookmarks } =
      this.access.settings();
    post(page, {
      type: 'settings',
      showHidden,
      sort,
      columns: heldColumns(columns),
      defaultColumns: this.access.defaultColumns(),
      canElevate: this.access.elevate !== undefined,
      platform: this.access.platform,
      thumbnailSize: heldBox(thumbnailSize),
      fileColors,
      bookmarks: shownBookmarks(bookmarks, this.bookmarkSystem),
      ...(this.access.closesBrackets?.() === true && { closeBrackets: true }),
    });
  }
}

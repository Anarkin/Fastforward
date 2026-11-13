import * as fs from 'node:fs';
import * as path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { strings, type Sentence } from '../../../shared/strings';
import {
  unattachedShell,
  type Page,
  type ShellAccess,
  type Tab,
  type TabName,
  type Tool,
} from '../../../shell/main/shell';
import { SavedSides } from './savedSides';
import {
  isSide,
  sides,
  type CommanderToHost,
  type Entry,
  type Side,
} from '../shared/protocol';
import { heldColumns, isColumnWidths, isSort } from '../shared/settings';
import type { LocalFileSystem } from './fileSystem';
import { pathParts } from '../shared/paths';
import {
  shownBookmarks,
  withBookmark,
  withoutBookmark,
  type BookmarkSystem,
} from './bookmarks';
import { typedPath } from './typedPaths';
import { heldBox } from '../../../shared/images';
import { fileVersion } from '../shared/files';
import { firstBytes } from './textRows';
import type { ElevatedFileSystem } from './elevated';
import { Editing } from './editing';
import { saveFile } from './fileSaving';
import { Icons } from './icons';
import { codeOf, reasonOf } from './reasons';
import { Transfers } from './transfers';
import { repositoriesIn } from './repositories';
import { maxDroppedIcons, viewerIconUrl } from '../shared/icons';
import {
  type Pane,
  newPane,
  type Panes,
  Sides,
  post,
  type Listing,
  sizedEntry,
  parentOf,
} from './sides';
import { Viewers } from './viewers';
import { SideScans } from './sideScans';
import { Serving } from './serving';
import { ArchiveCopies } from './archiveCopies';
import { TransferCommands } from './transferCommands';
import type { CommanderAccess } from './commanderAccess';
import { isFolder, isFile } from './fileStats';
import { FileCommands } from './fileCommands';
import { ReadingStopped, type Opener, ArchiveListing } from './archiveListing';

const maxHistory = 100;
export function childToward(folder: string, from: string): string | undefined {
  const relative = path.relative(folder, from);
  return relative === '' ||
    relative.startsWith('..') ||
    path.isAbsolute(relative)
    ? undefined
    : relative.split(path.sep)[0];
}

export function rootFolder(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
): string {
  return platform === 'win32' ? `${env.SystemDrive ?? 'C:'}\\` : '/';
}

function isGone(error: unknown): boolean {
  const code = codeOf(error);
  return code === 'ENOENT' || code === 'ENOTDIR';
}

function isDenied(error: unknown): boolean {
  const code = codeOf(error);
  return code === 'EACCES' || code === 'EPERM';
}

class RefusedAsAdministrator extends Error {
  readonly code: unknown;

  constructor(refused: unknown) {
    super(refused instanceof Error ? refused.message : String(refused));
    this.code = codeOf(refused);
  }
}

function entriesShown({ entries = [], sizing }: Pane): readonly Entry[] {
  return sizing === undefined
    ? entries
    : entries.map((entry) =>
        entry.folder ? sizedEntry(entry, sizing.sizes.of(entry.name)) : entry,
      );
}

export class CommanderTool implements Tool<'commander'> {
  private shell: ShellAccess = unattachedShell;
  private readonly sides = new Sides();
  private readonly viewers: Viewers;
  private readonly scans: SideScans;
  private readonly serving: Serving;
  private readonly copies: ArchiveCopies;
  private readonly transferCommands: TransferCommands;
  private readonly fileCommands: FileCommands;
  private readonly archiveListing: ArchiveListing;
  private fileSystem: Promise<LocalFileSystem> | undefined;
  private readonly icons: Icons;
  private elevated: ElevatedFileSystem | undefined;
  private elevating: Promise<ElevatedFileSystem | undefined> | undefined;
  private transferPage: Page | undefined;
  private readonly transfers: Transfers;
  private readonly savedSides: SavedSides;
  private readonly editing: Editing;

  constructor(private readonly access: CommanderAccess) {
    this.icons = new Icons(access.fileIcon, access.platform);
    this.viewers = new Viewers(access, this.sides, (file) =>
      this.hiddenParts(file),
    );
    this.scans = new SideScans(access, this.sides, {
      listed: (folder) => this.listed(folder),
      postListing: (page, tab, side, pane, selected) =>
        this.postListing(page, tab, side, pane, selected),
      list: (page, tab, side, folder, how) =>
        this.list(page, tab, side, folder, how),
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
          this.list(page, tab, side, folder, how, fallback, selecting),
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
          this.list(page, tab, side, folder, how, fallback, selecting),
      },
    );
    this.archiveListing = new ArchiveListing(access, this.sides, this.copies, {
      refuse: (page, message) => this.refuse(page, message),
      list: (page, tab, side, folder, how, fallback, selecting) =>
        this.list(page, tab, side, folder, how, fallback, selecting),
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
        this.list(page, tab.id, side, panes[side].folder, 'show'),
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
        return this.drive(page, message.tab, message.side, message.drive);
      case 'listDrives':
        return this.postDrives(page);
      case 'step':
        return this.step(page, message.tab, message.side, message.step);
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
        return this.transferCommands.pack(page, message);
      case 'testArchives':
        this.transferCommands.testArchives(page, message);
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
          : this.list(page, shown.tab, shown.side, shown.pane.folder, 'show');
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
        return this.elevate(page, message.tab, message.side);
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
        return this.goToBookmark(page, message);
      case 'goTo':
        return this.goTo(page, message);
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
    this.elevated?.close();
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

  private async elevate(
    page: Page,
    tab: unknown,
    side: unknown,
  ): Promise<void> {
    const shown = this.sides.shownPane(page, tab, side);
    const folder = shown?.pane.denied;
    const { elevate } = this.access;
    if (shown === undefined || folder === undefined || elevate === undefined) {
      return;
    }
    if (this.elevated !== undefined) {
      await this.list(page, shown.tab, shown.side, folder, 'visit');
      return;
    }
    this.elevating ??= elevate().then(
      (elevated) => {
        this.elevating = undefined;
        if (elevated !== undefined) {
          this.elevated = elevated;
          void elevated.closed.then(() => {
            if (this.elevated === elevated) {
              this.elevated = undefined;
              this.helperStopped();
            }
          });
        }
        return elevated;
      },
      () => {
        this.elevating = undefined;
        this.shell.notice(page, {
          level: 'error',
          message: strings.commander.helperFailed,
        });
        return undefined;
      },
    );
    if ((await this.elevating) !== undefined) {
      await this.list(page, shown.tab, shown.side, folder, 'visit');
    }
  }

  private helperStopped(): void {
    const page = this.shell.page();
    let readAsAdministrator = false;
    for (const [tab, panes] of this.sides.panes) {
      for (const side of sides) {
        const pane = panes[side];
        if (pane.elevated !== true) {
          continue;
        }
        readAsAdministrator = true;
        pane.elevated = false;
        pane.entries = undefined;
        pane.denied = pane.folder;
        const shownIn = this.sides.pageShowing(tab);
        if (shownIn !== undefined) {
          this.postListing(shownIn, tab, side, pane, undefined);
          post(shownIn, {
            type: 'noAccess',
            side,
            folder: pane.folder,
            asAdministrator: true,
          });
        }
      }
    }
    if (readAsAdministrator) {
      this.shell.notice(page, {
        level: 'error',
        message: strings.commander.helperStopped,
      });
    }
  }

  private async listed(
    folder: string,
    opener?: Opener,
  ): Promise<{
    readonly entries: readonly Entry[];
    readonly elevated: boolean;
    readonly archive?: string;
  }> {
    const inside = this.access.archives?.within(folder);
    if (inside !== undefined) {
      return this.archiveListing.archiveListed(
        inside.archive.file,
        folder,
        undefined,
        opener,
      );
    }
    const files = await this.files();
    try {
      return { entries: await files.list(folder), elevated: false };
    } catch (error) {
      const holding = isGone(error)
        ? await this.access.archives?.fileHolding(folder)
        : undefined;
      if (holding !== undefined) {
        return this.archiveListing.archiveListed(
          holding,
          folder,
          error,
          opener,
        );
      }
      if (!isDenied(error) || this.elevated === undefined) {
        throw error;
      }
    }
    try {
      return { entries: await this.elevated.list(folder), elevated: true };
    } catch (error) {
      throw isDenied(error) ? new RefusedAsAdministrator(error) : error;
    }
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

  private async findRepositories(
    page: Page,
    tab: string,
    side: Side,
    pane: Pane,
    again: boolean,
  ): Promise<void> {
    const asked = ++pane.repositoriesAsked;
    const { folder } = pane;
    const folders = new Map(
      (pane.entries ?? [])
        .filter((entry) => entry.folder)
        .map((entry) => [entry.name, entry.modified]),
    );
    const looked =
      again && pane.looked?.folder === folder ? pane.looked.folders : undefined;
    const unchanged = (name: string) =>
      looked?.has(name) === true && looked.get(name) === folders.get(name);
    const kept = [...pane.repositories].filter(
      (name) => folders.has(name) && unchanged(name),
    );
    const [names, inside] = await Promise.all([
      repositoriesIn(
        folder,
        [...folders.keys()].filter((name) => !unchanged(name)),
        this.access.isRepository,
        () => pane.repositoriesAsked === asked,
      ),
      this.inRepository(folder),
    ]);
    if (pane.repositoriesAsked !== asked) {
      return;
    }
    pane.looked = { folder, folders };
    const found = new Set([...kept, ...names]);
    pane.repositories = found;
    if (this.sides.shown.get(page)?.tab === tab) {
      post(page, {
        type: 'repositories',
        tab,
        side,
        folder,
        names: [...folders.keys()].filter((name) => found.has(name)),
        ...(inside && { inRepository: true }),
      });
    }
  }

  private async inRepository(folder: string): Promise<boolean> {
    return (
      (await this.access.inRepository?.(folder).catch(() => false)) ?? false
    );
  }

  private step(
    page: Page,
    tab: unknown,
    side: unknown,
    step: unknown,
  ): Promise<void> {
    const shown = this.sides.shownPane(page, tab, side);
    if (shown === undefined || (step !== -1 && step !== 1)) {
      return Promise.resolve();
    }
    const at = shown.pane.at + step;
    const folder = shown.pane.history.at(at);
    return at < 0 || folder === undefined
      ? Promise.resolve()
      : this.list(page, shown.tab, shown.side, folder, { at });
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

  private async goToBookmark(
    page: Page,
    { tab, side, folder }: Extract<CommanderToHost, { type: 'goToBookmark' }>,
  ): Promise<void> {
    const shown = this.sides.shownPane(page, tab, side);
    const bookmarked = shownBookmarks(
      this.access.settings().bookmarks,
      this.bookmarkSystem,
    ).find((bookmark) => bookmark === folder);
    if (shown !== undefined && bookmarked !== undefined) {
      await this.list(page, shown.tab, shown.side, bookmarked, 'visit');
    }
  }

  private async goTo(
    page: Page,
    { tab, side, folder, to }: Extract<CommanderToHost, { type: 'goTo' }>,
  ): Promise<void> {
    const shown = this.sides.namingPane(page, tab, side, folder);
    const { home, variable, knownFolder } = this.access;
    const target =
      shown === undefined || typeof to !== 'string'
        ? undefined
        : await typedPath(to, shown.pane.folder, {
            ...this.bookmarkSystem,
            home,
            variable: variable ?? (() => undefined),
            knownFolder,
          });
    if (shown === undefined || target === undefined) {
      return;
    }
    if (await isFile(target)) {
      await this.list(
        page,
        shown.tab,
        shown.side,
        path.dirname(target),
        'visit',
        undefined,
        path.basename(target),
      );
      return;
    }
    await this.list(page, shown.tab, shown.side, target, 'visit');
  }

  private async drive(
    page: Page,
    tab: unknown,
    side: unknown,
    drive: unknown,
  ): Promise<void> {
    const shown = this.sides.shownPane(page, tab, side);
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
    fallback?: string,
    selecting?: string,
  ): Promise<void> {
    const pane = this.sides.panes.get(tab)?.[side];
    if (pane === undefined) {
      return;
    }
    if (
      pane.flat !== undefined &&
      pane.folder === folder &&
      (how === 'show' || how === 'refresh')
    ) {
      this.postListing(page, tab, side, pane, undefined);
      this.scans.flushFlat(tab, side, pane.flat);
      this.scans.flushDuplicates(tab, side, pane.duplicates);
      return;
    }
    if (how === 'refresh' && pane.reading !== undefined) {
      await pane.reading;
      if (pane.folder !== folder) {
        return;
      }
    }
    const asked = how === 'refresh' ? pane.asked : ++pane.asked;
    const stamp = await this.access.stamp?.(folder);
    let listing: Awaited<ReturnType<CommanderTool['listed']>>;
    try {
      listing = await this.listed(folder, (file) =>
        this.archiveListing.openFor(page, tab, side, file),
      );
    } catch (error) {
      if (error instanceof ReadingStopped) {
        if (pane.asked === asked && pane.folder === folder) {
          await this.list(
            page,
            tab,
            side,
            path.dirname(error.file),
            'show',
            undefined,
            path.basename(error.file),
          );
        }
        return;
      }
      if (
        pane.asked !== asked ||
        (how === 'refresh' && pane.landed !== asked)
      ) {
        return;
      }
      const nearest =
        (how === 'refresh' || how === 'show') && isGone(error)
          ? await this.nearestFolder(folder)
          : folder;
      if (nearest !== folder) {
        await this.list(page, tab, side, nearest, 'show');
        return;
      }
      if (how !== 'refresh') {
        if (isDenied(error) && fallback !== undefined) {
          await this.list(page, tab, side, fallback, how);
          return;
        }
        if (isDenied(error)) {
          pane.denied = folder;
          post(page, {
            type: 'noAccess',
            side,
            folder,
            asAdministrator:
              this.access.elevate !== undefined &&
              !(error instanceof RefusedAsAdministrator),
          });
        } else {
          this.shell.notice(page, {
            level: 'error',
            message: strings.commander.couldNotOpen(folder, reasonOf(error)),
          });
        }
        pane.landed = asked;
        this.postListing(page, tab, side, pane, undefined);
      }
      return;
    }
    const [hidden, binOff] = await Promise.all([
      this.hiddenParts(folder),
      listing.archive === undefined ? this.binOff(folder) : false,
    ]);
    if (pane.asked !== asked || (how === 'refresh' && pane.folder !== folder)) {
      return;
    }
    const listedAsBefore =
      how === 'refresh' &&
      pane.folder === folder &&
      pane.landed === asked &&
      pane.denied !== folder &&
      pane.elevated === listing.elevated &&
      pane.archive === listing.archive &&
      pane.binOff === binOff &&
      isDeepStrictEqual(pane.hidden, hidden) &&
      isDeepStrictEqual(pane.entries, listing.entries);
    const selected = selecting ?? childToward(folder, pane.folder);
    if (typeof how === 'object') {
      pane.at = how.at;
    } else if (how === 'visit' && pane.history[pane.at] !== folder) {
      const history = [...pane.history.slice(0, pane.at + 1), folder].slice(
        -maxHistory,
      );
      pane.history = history;
      pane.at = history.length - 1;
    }
    if (pane.folder !== folder) {
      pane.repositories = new Set();
      this.scans.endFlat(pane);
      this.scans.endSizing(pane);
      this.scans.endDuplicates(pane);
    }
    if (how === 'visit' || typeof how === 'object' || pane.denied === folder) {
      pane.denied = undefined;
    }
    if (pane.folder !== folder && !listing.elevated) {
      this.saveQuietly(this.savedSides.save(tab, side, folder));
    }
    const left = pane.folder !== folder;
    pane.folder = folder;
    if (left) {
      this.copies.letGoOfCopies();
    }
    pane.hidden = hidden;
    pane.entries = listing.entries;
    pane.elevated = listing.elevated;
    pane.archive = listing.archive;
    pane.binOff = binOff;
    pane.landed = asked;
    if (!listedAsBefore) {
      this.postListing(page, tab, side, pane, selected);
    }
    this.scans.feedDuplicates(pane);
    this.watch(page, tab, side, folder, stamp);
    if (listing.archive === undefined) {
      void this.shell.track(
        this.findRepositories(page, tab, side, pane, how === 'refresh'),
      );
    }
  }

  private async nearestFolder(gone: string): Promise<string> {
    for (
      let folder = parentOf(gone);
      folder !== undefined;
      folder = parentOf(folder)
    ) {
      if (
        (await isFolder(folder)) ||
        (await this.archiveListing.isArchiveFolder(folder))
      ) {
        return folder;
      }
    }
    return this.access.root;
  }

  private watch(
    page: Page,
    tab: string,
    side: Side,
    folder: string,
    listed: string | undefined,
  ): void {
    const showing = this.sides.shown.get(page);
    if (showing?.tab !== tab) {
      return;
    }
    const pane = this.sides.panes.get(tab)?.[side];
    const elevated = pane?.elevated === true ? this.elevated : undefined;
    const archive = pane?.archive;
    const current = showing.watching.get(side);
    if (
      current?.folder === folder &&
      current.elevated === (elevated !== undefined)
    ) {
      return;
    }
    current?.stop();
    const watch = elevated?.watch ?? this.access.watch;
    let listing = false;
    let changedMeanwhile = false;
    const refresh = (): void => {
      if (listing) {
        changedMeanwhile = true;
        return;
      }
      listing = true;
      void this.list(page, tab, side, folder, 'refresh').finally(() => {
        listing = false;
        if (changedMeanwhile) {
          changedMeanwhile = false;
          refresh();
        }
      });
    };
    showing.watching.set(side, {
      folder,
      elevated: elevated !== undefined,
      stop:
        archive === undefined
          ? watch(folder, refresh, listed)
          : watch(archive, refresh),
    });
  }

  private postListing(
    page: Page,
    tab: string,
    side: Side,
    pane: Pane,
    selected: string | undefined,
  ): void {
    if (this.sides.shown.get(page)?.tab === tab) {
      post(page, {
        type: 'listing',
        tab,
        side,
        folder: pane.folder,
        hidden: pane.hidden ?? [],
        entries: pane.flat === undefined ? entriesShown(pane) : [],
        parent: parentOf(pane.folder) !== undefined,
        elevated: pane.elevated === true,
        ...(pane.binOff === true && { binOff: true }),
        ...(pane.archive !== undefined && { archive: pane.archive }),
        back: pane.at > 0,
        forward: pane.at < pane.history.length - 1,
        selected,
        ...(pane.flat !== undefined && { flat: pane.flat.walk }),
        ...(pane.duplicates !== undefined && {
          duplicates: pane.duplicates.look,
        }),
      });
    }
  }

  private async hiddenParts(file: string): Promise<readonly boolean[]> {
    const files = await this.files();
    return Promise.all(pathParts(file).map((part) => files.hidden(part.path)));
  }

  private async binOff(folder: string): Promise<boolean> {
    try {
      return (await this.access.binOff?.(folder)) === true;
    } catch {
      return false;
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

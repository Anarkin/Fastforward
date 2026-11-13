import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import {
  plainOf,
  sentencesOf,
  strings,
  type Sentence,
} from '../../../shared/strings';
import {
  unattachedShell,
  type Page,
  type ShellAccess,
  type Tab,
  type TabName,
  type Tool,
} from '../../../shell/main/shell';
import { sameRoot, type Store } from '../../../shell/main/storage';
import { SavedSides } from './savedSides';
import {
  isSide,
  otherSide,
  isFolderCommand,
  isTextEncoding,
  type TextEncoding,
  parentFolder,
  sides,
  isDrop,
  type CommanderToHost,
  type EndingSource,
  type Entry,
  type Side,
} from '../shared/protocol';
import {
  heldColumns,
  isColumnWidths,
  isSort,
  type Sorts,
  type ColumnWidths,
  type CommanderSettings,
} from '../shared/settings';
import type { LocalFileSystem } from './fileSystem';
import { pathParts, folderKey } from '../shared/paths';
import {
  shownBookmarks,
  withBookmark,
  withoutBookmark,
  type BookmarkSystem,
} from './bookmarks';
import { typedPath } from './typedPaths';
import type { WatchFolder, WatchTree } from './watch';
import type { ContentReader } from './duplicates';
import { heldBox } from '../../../shared/images';
import { archiveJob, archiveTests } from './packing';
import { copiedBetween } from './betweenArchives';
import {
  firstVolumeOf,
  isPackFormat,
  isPackLevel,
  isZipCipher,
  packPasswordProblem,
  smallestVolume,
} from '../shared/packing';
import { fileVersion } from '../shared/files';
import { firstBytes } from './textRows';
import type {
  ArchiveAccess,
  ArchiveBranch,
  OpenedArchive,
  PackPlan,
  Opening,
} from './archives';
import { unpackingFirst } from './unpacking';
import type { ElevatedFileSystem } from './elevated';
import { Editing } from './editing';
import type { TextDefaults } from './textDefaults';
import { saveFile, type Saved } from './fileSaving';
import { Icons } from './icons';
import { codeOf, reasonOf } from './reasons';
import { Transfers, type ConnectTransfer, type TransferAsk } from './transfers';
import { nameProblem } from '../shared/names';
import { repositoriesIn } from './repositories';
import type { SizeWalker } from './folderSizes';
import { maxDroppedIcons, viewerIconUrl } from '../shared/icons';
import {
  type Pane,
  newPane,
  type Panes,
  type ShownPane,
  Sides,
  post,
  type Listing,
  sizedEntry,
  listedIn,
} from './sides';
import { archiveItems } from './archiveItems';
import { type PdfPlaceStore, Viewers } from './viewers';
import { SideScans } from './sideScans';
import { type Thumbnails, Serving } from './serving';
import { ArchiveCopies } from './archiveCopies';

export interface CommanderAccess {
  readonly pdfPlaces: PdfPlaceStore;
  readonly fileSystem: () => Promise<LocalFileSystem>;
  readonly settings: () => CommanderSettings;
  readonly closesBrackets?: () => boolean;
  readonly defaultColumns: () => ColumnWidths;
  readonly saveShowHidden: (shown: boolean) => Promise<void>;
  readonly saveColumns: (columns: ColumnWidths) => Promise<void>;
  readonly saveSorts: (sorts: Sorts) => Promise<void>;
  readonly saveBookmarks: (bookmarks: readonly string[]) => Promise<void>;
  readonly store: Store;
  readonly thumbnails: Thumbnails;
  readonly streamed?: (file: string) => boolean | Promise<boolean>;
  readonly isRepository: (folder: string) => Promise<boolean>;
  readonly inRepository?: (folder: string) => Promise<boolean>;
  readonly initRepository?: (folder: string) => Promise<void>;
  readonly cloneInto?: (folder: string) => Promise<void>;
  readonly stamp?: (folder: string) => Promise<string | undefined>;
  readonly watch: WatchFolder;
  readonly watchTree?: WatchTree;
  readonly fileIcon: (file: string) => Promise<Uint8Array>;
  readonly platform: NodeJS.Platform;
  readonly codePage: () => Promise<TextEncoding>;
  readonly saveEdited?: (
    file: string,
    bytes: Uint8Array,
    overwriteReadOnly: boolean,
  ) => Promise<Saved>;
  readonly readOnlyFile?: (file: string) => boolean;
  readonly editorDefaults?: (
    file: string,
    asksGit: boolean,
  ) => Promise<TextDefaults>;
  readonly editorSources?: (file: string) => Promise<readonly EndingSource[]>;
  readonly elevate?: () => Promise<ElevatedFileSystem | undefined>;
  readonly realPath: (link: string) => Promise<string>;
  readonly openFile?: (file: string) => Promise<string>;
  readonly trash?: (file: string) => Promise<void>;
  readonly binOff?: (folder: string) => Promise<boolean>;
  readonly remove?: (file: string) => Promise<void>;
  readonly makeFolder?: (folder: string) => Promise<void>;
  readonly renameItem?: (from: string, to: string) => Promise<void>;
  readonly startDrag?: (files: readonly string[]) => Promise<void>;
  readonly clipboardFiles?: {
    readonly write: (files: readonly string[]) => Promise<void>;
    readonly read: () => Promise<readonly string[]>;
  };
  readonly shellMenu?: (
    files: readonly string[],
    at: { readonly x: number; readonly y: number },
    extended: boolean,
  ) => Promise<void>;
  readonly connectTransfer: ConnectTransfer;
  readonly archives?: ArchiveAccess;
  readonly viewedCopies?: string;
  readonly sizeWalker?: SizeWalker;
  readonly root: string;
  readonly home?: string;
  readonly variable?: (name: string) => string | undefined;
  readonly knownFolder?: (name: string) => Promise<string | undefined>;
  readonly contentReader?: ContentReader;
}

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

function parentOf(folder: string): string | undefined {
  const parent = path.dirname(folder);
  return parent === folder ? undefined : parent;
}

function isGone(error: unknown): boolean {
  const code = codeOf(error);
  return code === 'ENOENT' || code === 'ENOTDIR';
}

function isDenied(error: unknown): boolean {
  const code = codeOf(error);
  return code === 'EACCES' || code === 'EPERM';
}

const readingToldAfter = 300;

class ReadingStopped extends Error {
  constructor(readonly file: string) {
    super(file);
  }
}

type Opener = (file: string) => Promise<Opening | undefined>;

class RefusedAsAdministrator extends Error {
  readonly code: unknown;

  constructor(refused: unknown) {
    super(refused instanceof Error ? refused.message : String(refused));
    this.code = codeOf(refused);
  }
}

async function isFolder(folder: string): Promise<boolean> {
  try {
    return (await fs.promises.stat(folder)).isDirectory();
  } catch {
    return false;
  }
}

async function isFile(file: string): Promise<boolean> {
  try {
    return (await fs.promises.stat(file)).isFile();
  } catch {
    return false;
  }
}

function entriesShown({ entries = [], sizing }: Pane): readonly Entry[] {
  return sizing === undefined
    ? entries
    : entries.map((entry) =>
        entry.folder ? sizedEntry(entry, sizing.sizes.of(entry.name)) : entry,
      );
}

function branchesNamed(
  archive: OpenedArchive,
  inner: readonly string[],
  names: readonly string[],
): ArchiveBranch[] {
  return names.flatMap((name) => {
    const parts = name.split(path.sep);
    return (
      archive.tree.branch(
        [...inner, ...parts.slice(0, -1)],
        parts.at(-1) ?? name,
      ) ?? []
    );
  });
}

function nameShared(
  names: readonly string[],
  key: (name: string) => string,
): string | undefined {
  const seen = new Set<string>();
  for (const name of names) {
    const base = path.basename(name);
    const each = key(base);
    if (seen.has(each)) {
      return base;
    }
    seen.add(each);
  }
  return undefined;
}

export class CommanderTool implements Tool<'commander'> {
  private shell: ShellAccess = unattachedShell;
  private readonly sides = new Sides();
  private readonly viewers: Viewers;
  private readonly scans: SideScans;
  private readonly serving: Serving;
  private readonly copies: ArchiveCopies;
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
      finished: (ask) => this.transferred(ask),
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
        return this.editFile(
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
        return this.openEntry(
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
        return this.view(
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
        return this.shellMenu(page, message);
      case 'delete':
        return this.delete(page, message);
      case 'transfer':
        return this.transfer(page, message);
      case 'newFolder':
        return this.newFolder(page, message);
      case 'newFile':
        return this.newFile(page, message);
      case 'editViewed':
        return this.editViewed(page, message);
      case 'rename':
        return this.rename(page, message);
      case 'pack':
        return this.pack(page, message);
      case 'testArchives':
        this.testArchives(page, message);
        return undefined;
      case 'copyToClipboard':
        return this.copyToClipboard(page, message);
      case 'drag':
        return this.drag(page, message);
      case 'paste':
        return this.paste(page, message);
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
        return this.compare(page, message.tab, message.files);
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
        return this.openOnSide(page, message);
      case 'enterArchive':
        return this.enterArchive(page, message);
      case 'password':
        this.copies.answerPassword(message.ask, message.password);
        return undefined;
      case 'updateArchive':
        this.copies.answerUpdate(message.ask, message.update);
        return undefined;
      case 'openRepository':
        return this.openRepository(page, message);
      case 'folderCommand':
        return this.folderCommand(page, message);
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
    const shown = isDrop(message)
      ? this.sides.diskPane(page, message.tab, message.side, message.folder)
      : undefined;
    if (
      shown === undefined ||
      !isDrop(message) ||
      !Array.isArray(files) ||
      files.length === 0 ||
      !files.every(
        (file: unknown) => typeof file === 'string' && path.isAbsolute(file),
      )
    ) {
      return Promise.resolve();
    }
    const { folder } = shown.pane;
    const { into, move } = message;
    const target =
      into === undefined
        ? folder
        : into === parentFolder
          ? parentOf(folder)
          : listedIn(shown.pane, into)?.folder === true
            ? path.join(folder, into)
            : undefined;
    if (target === undefined) {
      return Promise.resolve();
    }
    if (shown.pane.elevated === true) {
      this.refuse(page, strings.commander.transferAsAdministrator);
      return Promise.resolve();
    }
    const sources: readonly string[] = files;
    this.startTransfer(page, {
      plan: { sources, target, move },
      folder: path.dirname(sources[0]),
      names: sources.map((source) => path.basename(source)),
    });
    return Promise.resolve();
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

  private async openEntry(
    page: Page,
    shown: ShownPane | undefined,
    name: unknown,
  ): Promise<void> {
    if (shown === undefined || typeof name !== 'string') {
      return;
    }
    const { folder } = shown.pane;
    if (name === parentFolder) {
      const parent = parentOf(folder);
      if (parent !== undefined) {
        await this.list(page, shown.tab, shown.side, parent, 'visit');
      }
      return;
    }
    const entry = listedIn(shown.pane, name);
    if (entry === undefined) {
      return;
    }
    if (!entry.folder && shown.pane.archive !== undefined) {
      const [copy] =
        (await this.copies.copiesIn(page, shown.pane, [name])) ?? [];
      if (copy === undefined) {
        return;
      }
      const putBack = this.copies.putBackOf(folder, name, copy);
      if (putBack === undefined) {
        await fs.promises.chmod(copy, 0o444);
      } else {
        await this.copies.watchCopy(putBack, copy);
      }
      await this.openFileNamed(page, copy, name);
      return;
    }
    const opened = path.join(folder, name);
    if (!entry.folder) {
      await this.openFileNamed(page, opened, name);
      return;
    }
    const target = entry.link
      ? await this.access.realPath(opened).catch(() => undefined)
      : undefined;
    await this.list(
      page,
      shown.tab,
      shown.side,
      opened,
      'visit',
      target === opened ? undefined : target,
    );
  }

  private async openFileNamed(
    page: Page,
    file: string,
    name: string,
  ): Promise<void> {
    const failure = await this.access.openFile?.(file);
    if (failure) {
      this.shell.notice(page, {
        level: 'error',
        message: strings.commander.openFailed(name, failure),
      });
    }
  }

  private async view(
    page: Page,
    shown: ShownPane | undefined,
    name: unknown,
  ): Promise<void> {
    const entry = listedIn(shown?.pane, name);
    if (
      shown === undefined ||
      typeof name !== 'string' ||
      entry === undefined ||
      entry.folder
    ) {
      return;
    }
    if (shown.pane.archive === undefined) {
      await this.shell.openView(
        page,
        'commander',
        path.join(shown.pane.folder, name),
      );
      return;
    }
    const { viewedCopies } = this.access;
    const [copy] =
      (await this.copies.copiesIn(
        page,
        shown.pane,
        [name],
        viewedCopies === undefined
          ? undefined
          : path.join(viewedCopies, randomUUID()),
      )) ?? [];
    if (copy !== undefined) {
      await this.shell.openView(page, 'commander', copy);
    }
  }

  private async editFile(
    page: Page,
    shown: ShownPane | undefined,
    name: unknown,
  ): Promise<void> {
    const entry = listedIn(shown?.pane, name);
    if (
      shown === undefined ||
      typeof name !== 'string' ||
      entry === undefined
    ) {
      return;
    }
    if (!entry.folder && shown.pane.archive !== undefined) {
      await this.copies.editInArchive(page, shown, name);
      return;
    }
    const file = path.join(shown.pane.folder, name);
    const refusal = entry.folder
      ? strings.editor.folder(name)
      : shown.pane.elevated === true
        ? strings.editor.asAdministrator(name)
        : await this.editing.refusal(file);
    if (refusal !== undefined) {
      this.shell.notice(page, { level: 'error', message: refusal });
      return;
    }
    await this.shell.openEdit(page, 'commander', file);
  }

  private async delete(
    page: Page,
    {
      tab,
      side,
      folder: named,
      names,
      permanently,
    }: Extract<CommanderToHost, { type: 'delete' }>,
  ): Promise<void> {
    const inArchive = this.sides.namingPane(page, tab, side, named);
    if (inArchive?.pane.archive !== undefined) {
      this.copies.deleteInArchive(page, inArchive, names);
      return;
    }
    const shown = this.sides.diskPane(page, tab, side, named);
    if (
      shown === undefined ||
      !Array.isArray(names) ||
      names.length === 0 ||
      !names.every(
        (name: unknown) => listedIn(shown.pane, name) !== undefined,
      ) ||
      typeof permanently !== 'boolean'
    ) {
      return;
    }
    if (shown.pane.elevated === true) {
      this.shell.notice(page, {
        level: 'error',
        message: strings.commander.deleteAsAdministrator,
      });
      return;
    }
    const deleting = permanently ? this.access.remove : this.access.trash;
    if (deleting === undefined) {
      return;
    }
    const { folder } = shown.pane;
    for (const name of names) {
      try {
        await deleting(path.join(folder, name));
      } catch (error) {
        this.shell.notice(page, {
          level: 'error',
          message: strings.commander.deleteFailed(
            name,
            error instanceof Error ? error.message : String(error),
          ),
        });
      }
    }
    const { flat } = shown.pane;
    if (flat !== undefined) {
      for (const name of names) {
        flat.tree.changed(name);
      }
    } else if (shown.pane.folder === folder) {
      await this.list(page, shown.tab, shown.side, folder, 'show');
    }
  }

  private transfer(
    page: Page,
    {
      tab,
      side,
      folder,
      names,
      target,
      move,
      existing,
    }: Extract<CommanderToHost, { type: 'transfer' }>,
  ): void {
    const shown = this.sides.namingPane(page, tab, side, folder);
    const other =
      shown && this.sides.panes.get(shown.tab)?.[otherSide(shown.side)];
    if (
      shown === undefined ||
      other === undefined ||
      other.folder !== target ||
      !Array.isArray(names) ||
      names.length === 0 ||
      !names.every(
        (name: unknown) => listedIn(shown.pane, name) !== undefined,
      ) ||
      typeof move !== 'boolean'
    ) {
      return;
    }
    if (shown.pane.elevated === true || other.elevated === true) {
      this.refuse(page, strings.commander.transferAsAdministrator);
      return;
    }
    if (other.archive !== undefined) {
      if (shown.pane.archive === undefined) {
        this.transferIn(page, shown, other, names, move, existing);
      } else {
        void this.shell.track(
          this.transferBetween(page, shown, other, names, move, existing),
        );
      }
      return;
    }
    if (shown.pane.archive !== undefined) {
      void this.shell.track(
        this.transferOut(page, shown.pane, target, names, move),
      );
      return;
    }
    this.startTransfer(page, {
      plan: {
        sources: names.map((name) => path.join(shown.pane.folder, name)),
        target,
        move,
      },
      folder: shown.pane.folder,
      names,
    });
  }

  private transferIn(
    page: Page,
    shown: ShownPane,
    other: Pane,
    names: readonly string[],
    move: boolean,
    existing: unknown,
  ): void {
    const { archives, platform, remove } = this.access;
    const inside = archives?.within(other.folder);
    if (
      archives === undefined ||
      inside === undefined ||
      (move && remove === undefined)
    ) {
      return;
    }
    const { archive, inner } = inside;
    const key = (each: string) => folderKey(each, platform);
    const there = new Set(
      (archive.tree.entries(inner) ?? []).map((entry) => key(entry.name)),
    );
    const clashing = names.filter((name) =>
      there.has(key(path.basename(name))),
    );
    if (clashing.length > 0 && existing !== 'replace' && existing !== 'skip') {
      this.askExisting(page, shown, other, names, move, clashing);
      return;
    }
    const kept =
      existing === 'skip'
        ? names.filter((name) => !clashing.includes(name))
        : names;
    const alike = nameShared(kept, key);
    if (alike !== undefined) {
      this.refuse(page, strings.commander.namesAlike(alike));
      return;
    }
    const { folder } = shown.pane;
    const into = kept.find((name) => {
      const item = key(path.join(folder, name));
      return (
        key(archive.file) === item ||
        key(archive.file).startsWith(`${item}${path.sep}`)
      );
    });
    if (into !== undefined) {
      this.refuse(page, strings.commander.intoItself(into));
      return;
    }
    if (kept.length === 0 || !this.copies.changeable(page, archive)) {
      return;
    }
    this.transfers.start(
      {
        plan: {
          sources: kept.map((name) => path.join(folder, name)),
          target: other.folder,
          move,
        },
        folder,
        names: kept,
        archive: {
          job: move ? 'moveIn' : 'copyIn',
          file: archive.file,
          at: other.folder,
        },
      },
      archiveJob(path.basename(archive.file), async (options) => {
        const added = await archives.addItems(
          archive,
          inner,
          folder,
          kept,
          options,
        );
        if (!move || added.kind === 'refused') {
          return added;
        }
        if (added.warning !== undefined) {
          return {
            kind: 'packed',
            warning: sentencesOf([
              added.warning,
              strings.commander.originalsKept,
            ]),
          };
        }
        const failures: string[] = [];
        for (const name of kept) {
          try {
            await remove?.(path.join(folder, name));
          } catch (error) {
            failures.push(`${name}: ${reasonOf(error)}`);
          }
        }
        return failures.length === 0
          ? added
          : { kind: 'packed', warning: failures.join(' ') };
      }),
    );
  }

  private async transferBetween(
    page: Page,
    shown: ShownPane,
    other: Pane,
    names: readonly string[],
    move: boolean,
    existing: unknown,
  ): Promise<void> {
    const { archives, platform } = this.access;
    const into = archives?.within(other.folder);
    if (archives === undefined || into === undefined) {
      return;
    }
    const key = (each: string) => folderKey(each, platform);
    const { folder } = shown.pane;
    const sources = names.map((name) => path.join(folder, name));
    const target = other.folder;
    const resolved = (each: string) => key(path.resolve(each));
    if (
      sources.some((each) => resolved(path.dirname(each)) === resolved(target))
    ) {
      this.refuse(page, strings.commander.alreadyIn(target));
      return;
    }
    const intoItself = sources.find((each) => {
      const relative = path.relative(resolved(each), resolved(target));
      return (
        relative !== '..' &&
        !relative.startsWith(`..${path.sep}`) &&
        !path.isAbsolute(relative)
      );
    });
    if (intoItself !== undefined) {
      this.refuse(
        page,
        strings.commander.intoItself(path.basename(intoItself)),
      );
      return;
    }
    const there = new Set(
      (into.archive.tree.entries(into.inner) ?? []).map((entry) =>
        key(entry.name),
      ),
    );
    const clashing = names.filter((name) =>
      there.has(key(path.basename(name))),
    );
    if (clashing.length > 0 && existing !== 'replace' && existing !== 'skip') {
      this.askExisting(page, shown, other, names, move, clashing);
      return;
    }
    const kept =
      existing === 'skip'
        ? names.filter((name) => !clashing.includes(name))
        : names;
    const found = archiveItems(this.access.archives, shown.pane, kept);
    if (kept.length === 0 || found === undefined) {
      return;
    }
    const { archive, inner, paths, withoutFolders, files, bytes, encrypted } =
      found;
    const alike = withoutFolders ? nameShared(kept, key) : undefined;
    if (alike !== undefined) {
      this.refuse(page, strings.commander.namesAlike(alike));
      return;
    }
    if (
      !this.copies.changeable(page, into.archive) ||
      (move && !this.copies.changeable(page, archive))
    ) {
      return;
    }
    if (
      encrypted &&
      !archives.hasPassword(archive.file) &&
      !(await this.copies.passwordGiven(page, archive.file, false))
    ) {
      return;
    }
    this.transfers.start(
      {
        plan: {
          sources: kept.map((name) => path.join(folder, name)),
          target,
          move,
        },
        folder,
        names: kept,
        archive: {
          job: move ? 'moveIn' : 'copyIn',
          file: into.archive.file,
          at: target,
        },
      },
      archiveJob(path.basename(into.archive.file), (options) =>
        copiedBetween(
          archives,
          {
            archive,
            paths,
            depth: inner.length,
            withoutFolders,
            files,
            bytes,
            roots: branchesNamed(archive, inner, kept),
            platform,
          },
          into,
          move,
          options,
        ),
      ),
    );
  }

  private async transferOut(
    page: Page,
    pane: Pane,
    target: string,
    names: readonly string[],
    move: boolean,
  ): Promise<void> {
    const found = archiveItems(this.access.archives, pane, names);
    if (
      found === undefined ||
      (move && !this.copies.changeable(page, found.archive))
    ) {
      return;
    }
    const {
      archives,
      archive,
      inner,
      paths,
      withoutFolders,
      files,
      bytes,
      encrypted,
    } = found;
    if (
      encrypted &&
      !archives.hasPassword(archive.file) &&
      !(await this.copies.passwordGiven(page, archive.file, false))
    ) {
      return;
    }
    this.transfers.start(
      {
        plan: {
          sources: names.map((name) => path.join(pane.folder, name)),
          target,
          move,
        },
        folder: pane.folder,
        names,
      },
      unpackingFirst(
        {
          archives,
          archive,
          paths,
          depth: inner.length,
          withoutFolders,
          files,
          bytes,
          ...(move && {
            moving: {
              roots: branchesNamed(archive, inner, names),
              platform: this.access.platform,
            },
          }),
        },
        this.access.connectTransfer,
      ),
    );
  }

  private askExisting(
    page: Page,
    shown: ShownPane,
    other: Pane,
    names: readonly string[],
    move: boolean,
    existing: readonly string[],
  ): void {
    post(page, {
      type: 'askExisting',
      tab: shown.tab,
      side: shown.side,
      folder: shown.pane.folder,
      names,
      target: other.folder,
      move,
      existing,
    });
  }

  private refuse(page: Page, message: Sentence): void {
    this.shell.notice(page, { level: 'error', message });
  }

  private startTransfer(page: Page, ask: TransferAsk): void {
    const { sources, target } = ask.plan;
    const key = (each: string) =>
      folderKey(path.resolve(each), this.access.platform);
    if (sources.some((source) => key(path.dirname(source)) === key(target))) {
      this.refuse(page, strings.commander.alreadyIn(target));
      return;
    }
    const intoItself = sources.find((source) => {
      const relative = path.relative(key(source), key(target));
      return (
        relative !== '..' &&
        !relative.startsWith(`..${path.sep}`) &&
        !path.isAbsolute(relative)
      );
    });
    if (intoItself !== undefined) {
      this.refuse(
        page,
        strings.commander.intoItself(path.basename(intoItself)),
      );
      return;
    }
    this.transfers.start(ask);
  }

  private listedFiles(
    page: Page,
    tab: unknown,
    side: unknown,
    folder: unknown,
    names: unknown,
  ): string[] | undefined {
    const shown = this.sides.diskPane(page, tab, side, folder);
    if (
      shown === undefined ||
      !Array.isArray(names) ||
      names.length === 0 ||
      !names.every((name: unknown) => listedIn(shown.pane, name) !== undefined)
    ) {
      return undefined;
    }
    return names.map((name: string) => path.join(shown.pane.folder, name));
  }

  private async copyToClipboard(
    page: Page,
    {
      tab,
      side,
      folder,
      names,
    }: Extract<CommanderToHost, { type: 'copyToClipboard' }>,
  ): Promise<void> {
    const shown = this.sides.namingPane(page, tab, side, folder);
    if (
      shown?.pane.archive !== undefined &&
      Array.isArray(names) &&
      names.length > 0 &&
      names.every((name: unknown) => listedIn(shown.pane, name) !== undefined)
    ) {
      const copies = await this.copies.copiesIn(page, shown.pane, names);
      if (copies !== undefined) {
        await this.access.clipboardFiles?.write(copies);
      }
      return;
    }
    const files = this.listedFiles(page, tab, side, folder, names);
    if (files !== undefined) {
      await this.access.clipboardFiles?.write(files);
    }
  }

  private async drag(
    page: Page,
    { tab, side, folder, names }: Extract<CommanderToHost, { type: 'drag' }>,
  ): Promise<void> {
    const files = this.listedFiles(page, tab, side, folder, names);
    if (files !== undefined) {
      await this.access.startDrag?.(files);
    }
  }

  private async paste(
    page: Page,
    { tab, side, folder }: Extract<CommanderToHost, { type: 'paste' }>,
  ): Promise<void> {
    const shown = this.sides.diskPane(page, tab, side, folder);
    const { clipboardFiles } = this.access;
    if (shown === undefined || clipboardFiles === undefined) {
      return;
    }
    if (shown.pane.elevated === true) {
      this.refuse(page, strings.commander.transferAsAdministrator);
      return;
    }
    const sources = await clipboardFiles.read();
    const [first] = sources;
    if (first === undefined) {
      this.shell.notice(page, {
        level: 'info',
        message: strings.commander.nothingToPaste,
      });
      return;
    }
    this.startTransfer(page, {
      plan: { sources, target: shown.pane.folder, move: false },
      folder: path.dirname(first),
      names: sources.map((source) => path.basename(source)),
    });
  }

  private async newFile(
    page: Page,
    { tab, side, folder, name }: Extract<CommanderToHost, { type: 'newFile' }>,
  ): Promise<void> {
    const shown = this.sides.namingPane(page, tab, side, folder);
    if (
      shown === undefined ||
      typeof name !== 'string' ||
      name !== path.basename(name) ||
      nameProblem(name, this.access.platform) !== undefined
    ) {
      return;
    }
    if (shown.pane.archive !== undefined) {
      await this.copies.newFileInArchive(page, shown, name);
      return;
    }
    const file = path.join(shown.pane.folder, name);
    const refusal =
      shown.pane.elevated === true
        ? strings.editor.asAdministrator(name)
        : await this.editing.refusal(file);
    if (refusal !== undefined) {
      this.shell.notice(page, { level: 'error', message: refusal });
      return;
    }
    await this.shell.openEdit(page, 'commander', file);
  }

  private async editViewed(
    page: Page,
    { tab, at, encoding }: Extract<CommanderToHost, { type: 'editViewed' }>,
  ): Promise<void> {
    const viewed = this.shell
      .tabs()
      .find((each) => each.id === tab && each.tool === 'commander');
    const file = viewed?.view === true ? viewed.root : undefined;
    if (
      file === undefined ||
      this.sides.shown.get(page)?.tab !== tab ||
      !Number.isSafeInteger(at) ||
      at < 0 ||
      (encoding !== undefined && !isTextEncoding(encoding))
    ) {
      return;
    }
    const refusal =
      this.copies.copyOf(file) === undefined
        ? await this.editing.refusal(file)
        : strings.editor.viewedCopy(path.basename(file));
    if (refusal !== undefined) {
      this.shell.notice(page, { level: 'error', message: refusal });
      return;
    }
    const edited = this.shell
      .tabs()
      .some(
        (each) =>
          each.tool === 'commander' &&
          each.edit === true &&
          each.root !== undefined &&
          sameRoot(each.root, file),
      );
    if (edited) {
      await this.shell.openEdit(page, 'commander', file);
      return;
    }
    this.editing.startAt(tab, {
      byte: at,
      ...(encoding !== undefined && { encoding }),
    });
    await this.shell.editViewed(page, tab);
  }

  private async newFolder(
    page: Page,
    {
      tab,
      side,
      folder,
      name,
    }: Extract<CommanderToHost, { type: 'newFolder' }>,
  ): Promise<void> {
    const inArchive = this.sides.namingPane(page, tab, side, folder);
    if (inArchive?.pane.archive !== undefined) {
      this.copies.folderInArchive(page, inArchive, name);
      return;
    }
    const shown = this.sides.diskPane(page, tab, side, folder);
    const { makeFolder } = this.access;
    if (
      shown === undefined ||
      makeFolder === undefined ||
      typeof name !== 'string' ||
      name !== path.basename(name) ||
      nameProblem(name, this.access.platform) !== undefined
    ) {
      return;
    }
    if (shown.pane.elevated === true) {
      this.shell.notice(page, {
        level: 'error',
        message: strings.commander.makeFolderAsAdministrator,
      });
      return;
    }
    const made = shown.pane.folder;
    try {
      await makeFolder(path.join(made, name));
    } catch (error) {
      this.shell.notice(page, {
        level: 'error',
        message:
          codeOf(error) === 'EEXIST'
            ? strings.commander.nameTaken(name)
            : strings.commander.makeFolderFailed(name, reasonOf(error)),
      });
      return;
    }
    if (shown.pane.folder === made) {
      await this.list(
        page,
        shown.tab,
        shown.side,
        made,
        'show',
        undefined,
        name,
      );
    }
  }

  private testArchives(
    page: Page,
    {
      tab,
      side,
      folder,
      names,
    }: Extract<CommanderToHost, { type: 'testArchives' }>,
  ): void {
    const shown = this.sides.diskPane(page, tab, side, folder);
    const { archives } = this.access;
    if (
      shown === undefined ||
      archives === undefined ||
      !Array.isArray(names) ||
      !names.every((name: unknown) => listedIn(shown.pane, name) !== undefined)
    ) {
      return;
    }
    const files = names.filter(
      (name: string) => listedIn(shown.pane, name)?.folder === false,
    );
    if (files.length === 0) {
      return;
    }
    if (shown.pane.elevated === true) {
      this.refuse(page, strings.commander.testAsAdministrator);
      return;
    }
    const paths = files.map((name) => path.join(shown.pane.folder, name));
    this.transfers.start(
      {
        plan: { sources: paths, target: shown.pane.folder, move: false },
        folder: shown.pane.folder,
        names: files,
        archive: { job: 'test', file: paths[0] ?? '', at: shown.pane.folder },
      },
      archiveTests(paths, async (file, options) => {
        for (;;) {
          const tested = await archives.test(file, options);
          if (tested.kind !== 'refused' || tested.needsPassword !== true) {
            return tested;
          }
          if (
            !(await this.copies.passwordGiven(
              page,
              file,
              archives.hasPassword(file),
            ))
          ) {
            return {
              kind: 'refused',
              reason: strings.commander.noPasswordGiven,
            };
          }
        }
      }),
    );
  }

  private async pack(
    page: Page,
    {
      tab,
      side,
      folder,
      names,
      archive,
      format,
      level,
      password,
      encryptNames,
      zipCipher,
      volumeBytes,
      test,
      replace,
    }: Extract<CommanderToHost, { type: 'pack' }>,
  ): Promise<void> {
    const shown = this.sides.diskPane(page, tab, side, folder);
    const { archives, platform } = this.access;
    if (
      shown === undefined ||
      archives === undefined ||
      !Array.isArray(names) ||
      names.length === 0 ||
      !names.every(
        (name: unknown) => listedIn(shown.pane, name) !== undefined,
      ) ||
      typeof archive !== 'string' ||
      !path.isAbsolute(archive) ||
      nameProblem(path.basename(archive), platform) !== undefined ||
      !isPackFormat(format) ||
      !isPackLevel(level) ||
      (password !== undefined &&
        (typeof password !== 'string' ||
          packPasswordProblem(password, format) !== undefined)) ||
      (encryptNames !== undefined && typeof encryptNames !== 'boolean') ||
      (zipCipher !== undefined && !isZipCipher(zipCipher)) ||
      (volumeBytes !== undefined &&
        (!Number.isSafeInteger(volumeBytes) || volumeBytes < smallestVolume)) ||
      (test !== undefined && typeof test !== 'boolean') ||
      (replace !== undefined && typeof replace !== 'boolean')
    ) {
      return;
    }
    if (shown.pane.elevated === true) {
      this.shell.notice(page, {
        level: 'error',
        message: strings.commander.packAsAdministrator,
      });
      return;
    }
    const key = (each: string) => folderKey(each, platform);
    const into = names.find((name) => {
      const item = key(path.join(shown.pane.folder, name));
      return (
        key(archive) === item || key(archive).startsWith(`${item}${path.sep}`)
      );
    });
    if (into !== undefined) {
      this.shell.notice(page, {
        level: 'error',
        message: strings.commander.intoItself(into),
      });
      return;
    }
    const first = volumeBytes === undefined ? archive : firstVolumeOf(archive);
    if (
      replace !== true &&
      (await fs.promises.lstat(first).then(
        () => true,
        () => false,
      ))
    ) {
      this.shell.notice(page, {
        level: 'error',
        message: strings.commander.archiveThereKept(archive),
      });
      return;
    }
    const plan: PackPlan = {
      folder: shown.pane.folder,
      items: names,
      archive,
      format,
      level,
      ...(password !== undefined && { password }),
      ...(encryptNames !== undefined && { encryptNames }),
      ...(zipCipher !== undefined && { zipCipher }),
      ...(volumeBytes !== undefined && { volumeBytes }),
      ...(test !== undefined && { test }),
    };
    this.transfers.start(
      {
        plan: {
          sources: [archive],
          target: path.dirname(archive),
          move: false,
        },
        folder: shown.pane.folder,
        names,
        archive: { job: 'pack', file: archive },
      },
      archiveJob(path.basename(archive), (options) =>
        archives.pack(plan, options),
      ),
    );
  }

  private async rename(
    page: Page,
    {
      tab,
      side,
      folder,
      name,
      to,
    }: Extract<CommanderToHost, { type: 'rename' }>,
  ): Promise<void> {
    const inArchive = this.sides.namingPane(page, tab, side, folder);
    if (inArchive?.pane.archive !== undefined) {
      this.copies.renameInArchive(page, inArchive, name, to);
      return;
    }
    const shown = this.sides.diskPane(page, tab, side, folder);
    const { renameItem } = this.access;
    if (
      shown === undefined ||
      renameItem === undefined ||
      typeof name !== 'string' ||
      listedIn(shown.pane, name) === undefined ||
      typeof to !== 'string' ||
      to !== path.basename(to) ||
      nameProblem(to, this.access.platform) !== undefined
    ) {
      return;
    }
    if (shown.pane.elevated === true) {
      this.shell.notice(page, {
        level: 'error',
        message: strings.commander.renameAsAdministrator,
      });
      return;
    }
    const { pane } = shown;
    const renamed = pane.folder;
    const from = path.join(renamed, name);
    try {
      await renameItem(from, path.join(path.dirname(from), to));
    } catch (error) {
      this.shell.notice(page, {
        level: 'error',
        message:
          codeOf(error) === 'EEXIST'
            ? strings.commander.nameTaken(to)
            : strings.commander.renameFailed(
                path.basename(from),
                reasonOf(error),
              ),
      });
      return;
    }
    if (pane.flat !== undefined) {
      pane.flat.tree.changed(name);
    } else if (pane.folder === renamed) {
      await this.list(
        page,
        shown.tab,
        shown.side,
        renamed,
        'show',
        undefined,
        to,
      );
    }
  }

  private transferred(ask: TransferAsk): void {
    for (const [page, showing] of this.sides.shown) {
      this.transferredIn(page, showing.tab, ask);
    }
  }

  private transferredIn(
    page: Page,
    tab: string,
    { plan, folder, names, archive }: TransferAsk,
  ): void {
    const panes = this.sides.panes.get(tab);
    if (panes === undefined) {
      return;
    }
    const key = (each: string) => folderKey(each, this.access.platform);
    for (const side of archive === undefined ? [] : sides) {
      const pane = panes[side];
      const inside = this.access.archives?.within(pane.folder);
      if (
        archive === undefined ||
        inside === undefined ||
        key(inside.archive.file) !== key(archive.file)
      ) {
        continue;
      }
      if (pane.flat === undefined) {
        void this.shell.track(
          this.list(
            page,
            tab,
            side,
            pane.folder,
            'show',
            undefined,
            key(pane.folder) === key(folder) ? archive.select : undefined,
          ),
        );
      } else {
        pane.flat.tree.changedAll();
      }
    }
    const changes = (each: string) =>
      (plan.move && key(each) === key(folder)) ||
      key(each) === key(plan.target);
    for (const side of sides) {
      const pane = panes[side];
      const { flat } = pane;
      if (!changes(pane.folder)) {
        continue;
      }
      if (flat === undefined) {
        void this.shell.track(this.list(page, tab, side, pane.folder, 'show'));
        continue;
      }
      if (plan.move && key(pane.folder) === key(folder)) {
        for (const name of names) {
          flat.tree.changed(name);
        }
      }
      if (key(pane.folder) === key(plan.target)) {
        for (const source of plan.sources) {
          flat.tree.changed(path.basename(source));
        }
      }
    }
  }

  private async shellMenu(
    page: Page,
    {
      tab,
      side,
      folder,
      names,
      x,
      y,
      extended,
    }: Extract<CommanderToHost, { type: 'shellMenu' }>,
  ): Promise<void> {
    const shown = this.sides.diskPane(page, tab, side, folder);
    if (
      shown === undefined ||
      !Array.isArray(names) ||
      !names.every(
        (name: unknown) => listedIn(shown.pane, name) !== undefined,
      ) ||
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      typeof extended !== 'boolean'
    ) {
      return;
    }
    if (new Set(names.map((name: string) => path.dirname(name))).size > 1) {
      this.shell.notice(page, {
        level: 'error',
        message: strings.commander.menuOfOneFolder,
      });
      return;
    }
    await this.access.shellMenu?.(
      names.length === 0
        ? [shown.pane.folder]
        : names.map((name: string) => path.join(shown.pane.folder, name)),
      { x, y },
      extended,
    );
  }

  private async folderCommand(
    page: Page,
    {
      tab,
      side,
      folder,
      name,
      command,
    }: Extract<CommanderToHost, { type: 'folderCommand' }>,
  ): Promise<void> {
    const shown = this.sides.diskPane(page, tab, side, folder);
    if (shown === undefined || !isFolderCommand(command)) {
      return;
    }
    const target =
      name === undefined
        ? shown.pane.folder
        : listedIn(shown.pane, name)?.folder === true
          ? path.join(shown.pane.folder, name)
          : undefined;
    if (target === undefined) {
      return;
    }
    switch (command) {
      case 'newTerminal':
        return this.shell.openFolders(page, 'terminal', [target]);
      case 'openInGit':
        return this.shell.openFolders(page, 'git', [target]);
      case 'cloneHere':
        return this.access.cloneInto?.(target);
      case 'initHere':
        return this.access.initRepository?.(target);
      default:
        return command satisfies never;
    }
  }

  private compare(page: Page, tab: unknown, files: unknown): Promise<void> {
    if (Array.isArray(files) && files.length === 0) {
      this.shell.notice(page, {
        level: 'info',
        message: strings.commander.nothingToCompare,
      });
      return Promise.resolve();
    }
    if (!Array.isArray(files) || files.length !== 2) {
      return Promise.resolve();
    }
    const named = files.map((file: unknown) => {
      if (typeof file !== 'object' || file === null) {
        return undefined;
      }
      const side = 'side' in file ? file.side : undefined;
      const folder = 'folder' in file ? file.folder : undefined;
      const name = 'name' in file ? file.name : undefined;
      const shown = this.sides.namingPane(page, tab, side, folder);
      const entry = listedIn(shown?.pane, name);
      return shown === undefined ||
        typeof name !== 'string' ||
        entry === undefined ||
        entry.folder
        ? undefined
        : { pane: shown.pane, name };
    });
    if (named.some((each) => each === undefined)) {
      return Promise.resolve();
    }
    return this.compareFiles(
      page,
      named.flatMap((each) => (each === undefined ? [] : [each])),
    );
  }

  private async compareFiles(
    page: Page,
    named: readonly { readonly pane: Pane; readonly name: string }[],
  ): Promise<void> {
    const paths: string[] = [];
    for (const { pane, name } of named) {
      const [file] =
        pane.archive === undefined
          ? [path.join(pane.folder, name)]
          : ((await this.copies.copiesIn(page, pane, [name])) ?? []);
      if (file === undefined) {
        return;
      }
      paths.push(file);
    }
    const [old, changed] = paths;
    if (old !== undefined && changed !== undefined) {
      await this.shell.openCompare(page, 'git', { old, new: changed });
    }
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
      return this.archiveListed(inside.archive.file, folder, undefined, opener);
    }
    const files = await this.files();
    try {
      return { entries: await files.list(folder), elevated: false };
    } catch (error) {
      const holding = isGone(error)
        ? await this.access.archives?.fileHolding(folder)
        : undefined;
      if (holding !== undefined) {
        return this.archiveListed(holding, folder, error, opener);
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

  private async archiveListed(
    file: string,
    folder: string,
    unopened?: unknown,
    opener?: Opener,
  ): Promise<{
    readonly entries: readonly Entry[];
    readonly elevated: boolean;
    readonly archive: string;
  }> {
    const { archives } = this.access;
    const opened = opener === undefined ? archives?.open(file) : opener(file);
    const opening: Opening | undefined = await (opened ??
      Promise.resolve({
        kind: 'refused',
        reason: strings.commander.noSevenZip,
      }));
    if (opening === undefined) {
      throw new ReadingStopped(file);
    }
    if (opening.kind === 'refused') {
      if (unopened !== undefined) {
        throw unopened;
      }
      throw Object.assign(
        new Error(plainOf(opening.reason)),
        (await isFile(file)) ? {} : { code: 'ENOENT' },
      );
    }
    const inner = path
      .relative(path.resolve(opening.archive.file), path.resolve(folder))
      .split(path.sep)
      .filter((part) => part !== '');
    const entries = opening.archive.tree.entries(inner);
    if (entries !== undefined) {
      return { entries, elevated: false, archive: opening.archive.file };
    }
    const nested = await this.nestedIn(opening.archive, inner);
    if (nested === undefined) {
      throw Object.assign(new Error(folder), { code: 'ENOENT' });
    }
    return this.archiveListed(nested, folder, unopened, opener);
  }

  private async nestedIn(
    archive: OpenedArchive,
    inner: readonly string[],
  ): Promise<string | undefined> {
    const { archives } = this.access;
    if (archives === undefined) {
      return undefined;
    }
    for (let length = inner.length; length > 0; length--) {
      const parts = inner.slice(0, length);
      const folderParts = parts.slice(0, -1);
      const last = parts.at(-1) ?? '';
      const entry = archive.tree
        .entries(folderParts)
        ?.find((each) => each.name === last);
      const item = archive.tree.item(folderParts, last);
      if (entry?.folder === false && item !== undefined) {
        const file = path.join(archive.file, ...parts);
        const opening = await archives.openInside(file, archive, item.path);
        return opening.kind === 'opened' ? file : undefined;
      }
    }
    return undefined;
  }

  private async isArchiveFolder(folder: string): Promise<boolean> {
    const inside = this.access.archives?.within(folder);
    return (
      inside !== undefined &&
      (await this.archiveListed(inside.archive.file, folder).then(
        () => true,
        () => false,
      ))
    );
  }

  private async openFor(
    page: Page,
    tab: string,
    side: Side,
    file: string,
    opening: (signal: AbortSignal) => Promise<Opening> | undefined = (signal) =>
      this.access.archives?.open(file, signal),
  ): Promise<Opening | undefined> {
    const { archives } = this.access;
    const pane = this.sides.panes.get(tab)?.[side];
    if (archives === undefined || pane === undefined) {
      return {
        kind: 'refused',
        reason: strings.commander.noSevenZip,
        noArchive: true,
      };
    }
    pane.opening?.abort();
    const aborting = new AbortController();
    pane.opening = aborting;
    const { promise: read, resolve: landed } = Promise.withResolvers<void>();
    pane.reading = read;
    let told = false;
    let telling: ReturnType<typeof setTimeout> | undefined;
    const tellLater = () => {
      telling = setTimeout(() => {
        told = true;
        post(page, {
          type: 'readingArchive',
          tab,
          side,
          name: path.basename(file),
        });
      }, readingToldAfter);
    };
    const stopTelling = () => {
      clearTimeout(telling);
      if (told) {
        told = false;
        post(page, { type: 'readingArchive', tab, side });
      }
    };
    const attempt = () => opening(aborting.signal) ?? archives.open(file);
    tellLater();
    try {
      let opened = await attempt();
      while (opened.kind === 'refused' && opened.needsPassword === true) {
        stopTelling();
        const passwordOf = opened.passwordOf ?? file;
        if (
          !(await this.copies.passwordGiven(
            page,
            passwordOf,
            archives.hasPassword(passwordOf),
          ))
        ) {
          return undefined;
        }
        tellLater();
        opened = await attempt();
      }
      return opened;
    } catch (error) {
      if (aborting.signal.aborted) {
        return undefined;
      }
      throw error;
    } finally {
      if (pane.opening === aborting) {
        pane.opening = undefined;
      }
      if (pane.reading === read) {
        pane.reading = undefined;
      }
      landed();
      stopTelling();
    }
  }

  private openingInside(
    pane: Pane,
    name: string,
    signal?: AbortSignal,
  ): Promise<Opening> {
    const { archives } = this.access;
    const inside = archives?.within(pane.folder);
    const parts = name.split(path.sep);
    const last = parts.at(-1) ?? name;
    const folderParts = [...(inside?.inner ?? []), ...parts.slice(0, -1)];
    const entry = inside?.archive.tree
      .entries(folderParts)
      ?.find((each) => each.name === last);
    const item = inside?.archive.tree.item(folderParts, last);
    if (
      archives === undefined ||
      inside === undefined ||
      item === undefined ||
      entry?.folder !== false
    ) {
      return Promise.resolve({
        kind: 'refused',
        reason: strings.commander.notAFile,
        noArchive: true,
      });
    }
    return archives.openInside(
      path.join(pane.folder, name),
      inside.archive,
      item.path,
      signal,
    );
  }

  private async enterArchive(
    page: Page,
    {
      tab,
      side,
      folder,
      name,
    }: Extract<CommanderToHost, { type: 'enterArchive' }>,
  ): Promise<void> {
    const shown = this.sides.namingPane(page, tab, side, folder);
    const entry = listedIn(shown?.pane, name);
    if (
      shown === undefined ||
      typeof name !== 'string' ||
      entry === undefined ||
      entry.folder
    ) {
      return;
    }
    const file = path.join(shown.pane.folder, name);
    const { pane } = shown;
    const opening = await this.openFor(
      page,
      shown.tab,
      shown.side,
      file,
      pane.archive === undefined
        ? undefined
        : (signal) => this.openingInside(pane, name, signal),
    );
    if (opening === undefined) {
      return;
    }
    if (opening.kind === 'refused') {
      this.refuse(
        page,
        strings.commander.notArchive(path.basename(file), opening.reason),
      );
      return;
    }
    await this.list(page, shown.tab, shown.side, file, 'visit');
  }

  private async openOnSide(
    page: Page,
    {
      tab,
      from,
      side,
      folder: named,
      name,
    }: Extract<CommanderToHost, { type: 'openOnSide' }>,
  ): Promise<void> {
    const source = this.sides.namingPane(page, tab, from, named);
    if (source === undefined || !isSide(side) || typeof name !== 'string') {
      return Promise.resolve();
    }
    const { folder, flat } = source.pane;
    const entry = listedIn(source.pane, name);
    if (flat === undefined && entry?.folder === false) {
      const file = path.join(folder, name);
      const { pane } = source;
      const opening = await this.openFor(
        page,
        source.tab,
        side,
        file,
        pane.archive === undefined
          ? undefined
          : (signal) => this.openingInside(pane, name, signal),
      );
      if (opening === undefined) {
        return undefined;
      }
      if (opening.kind === 'opened') {
        return this.list(page, source.tab, side, file, 'visit');
      }
      if (opening.kind === 'refused' && opening.noArchive !== true) {
        this.refuse(page, strings.commander.notArchive(name, opening.reason));
        return undefined;
      }
    }
    if (flat !== undefined && entry !== undefined) {
      return this.list(
        page,
        source.tab,
        side,
        path.dirname(path.join(folder, name)),
        'visit',
        undefined,
        entry.name,
      );
    }
    const target =
      name === parentFolder
        ? folder
        : entry === undefined
          ? undefined
          : entry.folder
            ? path.join(folder, name)
            : folder;
    return target === undefined
      ? Promise.resolve()
      : this.list(page, source.tab, side, target, 'visit');
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
        this.openFor(page, tab, side, file),
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
      if ((await isFolder(folder)) || (await this.isArchiveFolder(folder))) {
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

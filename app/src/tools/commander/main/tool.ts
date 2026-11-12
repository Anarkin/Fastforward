import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
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
import type { Store } from '../../../shell/main/storage';
import { SavedSides } from './savedSides';
import {
  isSide,
  otherSide,
  isFolderCommand,
  isTextEncoding,
  maxBytesAsked,
  maxColoredBytes,
  maxFindLength,
  maxRowsAsked,
  type TextEncoding,
  parentFolder,
  sides,
  isDrop,
  type CommanderToHost,
  type CommanderToWebview,
  type Entry,
  type FlatFolder,
  type FlatProgress,
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
import { pathParts } from '../shared/paths';
import {
  shownBookmarks,
  withBookmark,
  withoutBookmark,
  type BookmarkSystem,
} from './bookmarks';
import { typedPath } from './typedPaths';
import type { WatchFolder, WatchTree } from './watch';
import { FlatTree } from './flatTree';
import { Duplicates, type Compared, type ContentReader } from './duplicates';
import { hashingHere } from './contentHash';
import {
  fillsThumbnail,
  heldBox,
  imageType,
  isThumbnailBox,
  type ThumbnailBox,
  isWebp,
  madeThumbnailHeader,
  maxImageSize,
  maxThumbnailBytes,
  thumbnailBoxOf,
} from '../../../shared/images';
import { thumbnailKey } from './thumbnailStore';
import { archiveJob, archiveTests } from './packing';
import { copiedBetween } from './betweenArchives';
import {
  isPackFormat,
  isPackLevel,
  isZipCipher,
  packPasswordProblem,
  smallestVolume,
} from '../shared/packing';
import { ArchiveImages } from './archiveImages';
import { fileVersion, viewedFileOf } from '../shared/files';
import {
  blockCache,
  byteOrderMarkOf,
  codingOf,
  firstBytes,
  isUtf8,
  looksBinary,
  utf16Order,
  readingFile,
  type BlockCache,
  readBudgetBytes,
  rowsBefore,
  rowsFrom,
  rowStartAt,
} from './textRows';
import { findInFile } from './textFind';
import { fileResponse } from './fileRanges';
import {
  isPdf,
  isPdfFingerprint,
  pdfPlaceOf,
  pdfType,
  type PdfPlace,
} from '../../../shared/pdf';
import {
  itemsAt,
  type ArchiveAccess,
  type ArchiveBranch,
  type OpenedArchive,
  type PackOptions,
  type PackPlan,
  type Packing,
  type Opening,
} from './archives';
import { unpackingFirst } from './unpacking';
import type { ArchiveJob } from '../shared/transfers';
import type { ElevatedFileSystem } from './elevated';
import { Icons } from './icons';
import { codeOf, reasonOf } from './reasons';
import { Transfers, type ConnectTransfer, type TransferAsk } from './transfers';
import { folderKey } from '../shared/paths';
import { nameProblem } from '../shared/names';
import { onSameVolume, repositoriesIn } from './repositories';
import {
  FolderSizes,
  listingWalker,
  type FolderSize,
  type SizeWalker,
} from './folderSizes';
import {
  iconSourceOf,
  iconTicketOf,
  maxDroppedIcons,
  thumbnailSourceOf,
  viewerIconUrl,
  viewerOfIcon,
} from '../shared/icons';

interface PdfPlaceStore {
  readonly of: (fingerprint: string) => Promise<PdfPlace | undefined>;
  readonly save: (
    fingerprint: string,
    place: PdfPlace,
    file: string,
  ) => Promise<void>;
}

export interface CommanderAccess {
  readonly pdfPlaces: PdfPlaceStore;
  readonly fileSystem: () => Promise<LocalFileSystem>;
  readonly settings: () => CommanderSettings;
  readonly defaultColumns: () => ColumnWidths;
  readonly saveShowHidden: (shown: boolean) => Promise<void>;
  readonly saveColumns: (columns: ColumnWidths) => Promise<void>;
  readonly saveSorts: (sorts: Sorts) => Promise<void>;
  readonly saveBookmarks: (bookmarks: readonly string[]) => Promise<void>;
  readonly store: Store;
  readonly thumbnails: {
    readonly read: (key: string) => Promise<Uint8Array | undefined>;
    readonly has: (key: string) => Promise<boolean>;
    readonly full: () => Promise<boolean>;
    readonly write: (key: string, bytes: Uint8Array) => Promise<void>;
  };
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

interface Duplicating {
  readonly look: number;
  readonly duplicates: Duplicates;
  flushing: NodeJS.Timeout | undefined;
  flushed: number;
}

interface Flat {
  readonly walk: number;
  readonly tree: FlatTree;
  stopWatching: () => void;
  told: FlatProgress | undefined;
  flushing: NodeJS.Timeout | undefined;
  flushed: number;
}

interface Sizing {
  readonly sizes: FolderSizes;
  flushing: NodeJS.Timeout | undefined;
  flushed: number;
}

interface Pane {
  folder: string;
  flat?: Flat;
  sizing?: Sizing;
  duplicates?: Duplicating;
  hidden?: readonly boolean[];
  entries: readonly Entry[] | undefined;
  asked: number;
  landed: number;
  history: readonly string[];
  at: number;
  denied?: string;
  elevated?: boolean;
  archive?: string;
  opening?: AbortController;
  reading?: Promise<void>;
  binOff?: boolean;
  repositories: ReadonlySet<string>;
  repositoriesAsked: number;
  looked?: {
    readonly folder: string;
    readonly folders: ReadonlyMap<string, number | undefined>;
  };
}

type Listing = 'visit' | 'show' | 'refresh' | { readonly at: number };

const storedStatus = 204;
const onlineStatus = 409;
const fullStatus = 507;
const findProgressEvery = 150;
const maxHistory = 100;
const flushEvery = 100;
const maxEntriesTold = 5000;

function sameProgress(
  one: FlatProgress | undefined,
  other: FlatProgress,
): boolean {
  return (
    one !== undefined &&
    one.reading === other.reading &&
    one.stopped === other.stopped &&
    one.folders === other.folders &&
    one.failed === other.failed
  );
}

function inParts(folders: readonly FlatFolder[]): FlatFolder[][] {
  const parts: FlatFolder[][] = [];
  let part: FlatFolder[] = [];
  let entries = 0;
  for (const folder of folders) {
    if (part.length > 0 && entries + folder.entries.length > maxEntriesTold) {
      parts.push(part);
      part = [];
      entries = 0;
    }
    part.push(folder);
    entries += folder.entries.length;
  }
  if (part.length > 0 || parts.length === 0) {
    parts.push(part);
  }
  return parts;
}

function newPane(folder: string): Pane {
  return {
    folder,
    entries: undefined,
    asked: 0,
    landed: 0,
    history: [folder],
    at: 0,
    repositories: new Set(),
    repositoriesAsked: 0,
  };
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

interface Viewing {
  readonly tab: string;
  readonly file: string;
  size: number;
  readonly binary: boolean;
  readonly blocks: BlockCache;
  readonly stop: () => void;
}

interface Watched {
  readonly folder: string;
  readonly elevated: boolean;
  readonly stop: () => void;
}

interface Showing {
  readonly tab: string;
  readonly watching: Map<Side, Watched>;
  viewing?: Viewing;
  viewingsAsked: number;
  finding?: AbortController;
  findingRequest?: number;
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

const entriesByName = new WeakMap<
  readonly Entry[],
  ReadonlyMap<string, Entry>
>();

function sizedEntry(entry: Entry, size: FolderSize | undefined): Entry {
  return size === undefined
    ? entry
    : {
        ...entry,
        size: size.bytes,
        ...(size.counting && { counting: true }),
        ...(size.unread > 0 && { unreadFolders: size.unread }),
      };
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

function listedIn(pane: Pane | undefined, name: unknown): Entry | undefined {
  if (pane?.flat === undefined) {
    return entryNamed(pane?.entries, name);
  }
  return typeof name === 'string' ? pane.flat.tree.file(name) : undefined;
}

function entryNamed(
  entries: readonly Entry[] | undefined,
  name: unknown,
): Entry | undefined {
  if (entries === undefined || typeof name !== 'string') {
    return undefined;
  }
  let named = entriesByName.get(entries);
  if (named === undefined) {
    const built = new Map<string, Entry>();
    for (const entry of entries) {
      if (!built.has(entry.name)) {
        built.set(entry.name, entry);
      }
    }
    named = built;
    entriesByName.set(entries, named);
  }
  return named.get(name);
}

export class CommanderTool implements Tool<'commander'> {
  private shell: ShellAccess = unattachedShell;
  private readonly shown = new Map<Page, Showing>();
  private readonly panes = new Map<string, Panes>();
  private fileSystem: Promise<LocalFileSystem> | undefined;
  private readonly icons: Icons;
  private elevated: ElevatedFileSystem | undefined;
  private passwordAsks = 0;
  private updateAsks = 0;
  private readonly updatesAsked = new Map<
    number,
    {
      readonly name: string;
      readonly archive: string;
      readonly answer: (update: boolean) => void;
    }
  >();
  private readonly copiesWatched = new Set<() => void>();
  private archiveImages: ArchiveImages | undefined;
  private readonly passwordsAsked = new Map<
    number,
    {
      readonly page: Page;
      readonly answer: (password: string | undefined) => void;
    }
  >();
  private elevating: Promise<ElevatedFileSystem | undefined> | undefined;
  private transferPage: Page | undefined;
  private updateAskedIn: Page | undefined;
  private readonly pdfTabs = new Map<string, string>();
  private walks = 0;
  private looks = 0;
  private readonly transfers: Transfers;
  private readonly savedSides: SavedSides;

  constructor(private readonly access: CommanderAccess) {
    this.icons = new Icons(access.fileIcon, access.platform);
    this.savedSides = new SavedSides(access.store);
    this.transfers = new Transfers(access.connectTransfer, {
      show: (view) => {
        const kept = this.transferPage;
        const page =
          kept === undefined || kept.disposed ? this.shell.page() : kept;
        this.transferPage = view === undefined ? undefined : page;
        if (page !== undefined) {
          this.post(page, { type: 'transfer', view });
        }
      },
      notice: (notice) => this.shell.notice(undefined, notice),
      finished: (ask) => this.transferred(ask),
    });
  }

  attach(shell: ShellAccess): void {
    this.shell = shell;
  }

  ready(page: Page): void {
    this.cancelPasswords(page);
    this.icons.forgetDropped();
    for (const pane of this.allPanes()) {
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
    this.stopShowing(page);
    for (const [other, showing] of this.shown) {
      if (showing.tab === tab.id) {
        this.stopShowing(other);
        this.post(other, { type: 'hide' });
      }
    }
    this.shown.set(page, {
      tab: tab.id,
      watching: new Map(),
      viewingsAsked: 0,
    });
    this.askNextUpdate();
    if (tab.view === true && tab.root !== undefined) {
      this.post(page, { type: 'show', tab: tab.id, file: tab.root });
      await this.startViewing(page, tab.id, tab.root);
      return;
    }
    this.post(page, { type: 'show', tab: tab.id });
    const panes = this.panes.get(tab.id) ?? (await this.start(tab));
    if (!this.shows(page, tab)) {
      return;
    }
    this.panes.set(tab.id, panes);
    await Promise.all([
      ...sides.map((side) =>
        this.list(page, tab.id, side, panes[side].folder, 'show'),
      ),
      this.postDrives(page),
    ]);
  }

  shows(page: Page, tab: Tab): boolean {
    return this.shown.get(page)?.tab === tab.id;
  }

  hide(page: Page): void {
    if (this.shown.has(page)) {
      this.stopShowing(page);
      this.post(page, { type: 'hide' });
    }
  }

  preload(): Promise<void> {
    return Promise.resolve();
  }

  closed(page: Page, tab: Tab): void {
    this.post(page, { type: 'closed', tab: tab.id });
    const panes = this.panes.get(tab.id);
    if (panes !== undefined) {
      for (const side of sides) {
        this.endFlat(panes[side]);
        this.endSizing(panes[side]);
        this.endDuplicates(panes[side]);
      }
    }
    this.panes.delete(tab.id);
    this.saveQuietly(this.savedSides.keep((kept) => kept !== tab.id));
    for (const [shownIn, showing] of this.shown) {
      if (showing.tab === tab.id) {
        this.stopShowing(shownIn);
      }
    }
    if (tab.view === true && tab.root !== undefined) {
      this.removeCopy(tab.root);
    }
  }

  private removeCopy(viewed: string): void {
    const { viewedCopies } = this.access;
    if (viewedCopies === undefined) {
      return;
    }
    const inside = path.relative(viewedCopies, viewed);
    const [entry] = inside.split(path.sep);
    if (
      entry === undefined ||
      inside === '' ||
      entry === '..' ||
      path.isAbsolute(inside)
    ) {
      return;
    }
    const copy = path.join(viewedCopies, entry);
    const stillViewed = this.shell
      .tabs()
      .some(
        (open) =>
          open.view === true &&
          open.root !== undefined &&
          (open.root === copy || open.root.startsWith(`${copy}${path.sep}`)),
      );
    if (!stillViewed) {
      this.saveQuietly(
        fs.promises.rm(copy, { recursive: true, force: true, maxRetries: 3 }),
      );
    }
  }

  async receive(page: Page, message: CommanderToHost): Promise<void> {
    switch (message.type) {
      case 'open':
        return this.openEntry(
          page,
          this.namingPane(page, message.tab, message.side, message.folder),
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
          this.namingPane(page, message.tab, message.side, message.folder),
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
        return this.readRows(page, message);
      case 'readText':
        return this.readText(page, message);
      case 'findText':
        return this.findText(page, message);
      case 'stopFind': {
        const showing = this.shown.get(page);
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
        return this.readPdfPlace(page, message);
      case 'savePdfPlace':
        return this.savePdfPlace(page, message);
      case 'readBytes':
        return this.readBytes(page, message);
      case 'reread': {
        const shown = this.shownPane(page, message.tab, message.side);
        if (shown !== undefined) {
          this.endSizing(shown.pane);
          shown.pane.duplicates?.duplicates.forget();
        }
        if (shown?.pane.flat !== undefined) {
          this.startFlat(page, shown);
          return undefined;
        }
        return shown === undefined
          ? undefined
          : this.list(page, shown.tab, shown.side, shown.pane.folder, 'show');
      }
      case 'flat':
        return this.turnFlat(page, message);
      case 'stopReading': {
        const shown = this.shownPane(page, message.tab, message.side);
        shown?.pane.opening?.abort();
        shown?.pane.flat?.tree.stop();
        shown?.pane.sizing?.sizes.stop();
        shown?.pane.duplicates?.duplicates.stop();
        return undefined;
      }
      case 'countSizes':
        this.countSizes(page, message);
        return undefined;
      case 'openOnSide':
        return this.openOnSide(page, message);
      case 'enterArchive':
        return this.enterArchive(page, message);
      case 'password':
        this.answerPassword(message.ask, message.password);
        return undefined;
      case 'updateArchive':
        this.answerUpdate(message.ask, message.update);
        return undefined;
      case 'openRepository':
        return this.openRepository(page, message);
      case 'folderCommand':
        return this.folderCommand(page, message);
      case 'elevate':
        return this.elevate(page, message.tab, message.side);
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
          const { column, descending, groupByColor } = message.sort;
          await this.access.saveSorts({
            ...this.access.settings().sort,
            [message.side]: { column, descending, groupByColor },
          });
          this.postSettings(page);
        }
        return undefined;
      case 'saveThumbnail': {
        const listed = this.listedImage(
          message.tab,
          message.side,
          message.folder,
          message.name,
        );
        if (
          listed !== undefined &&
          !this.encryptedInArchive(listed) &&
          isThumbnailBox(message.box, message.pixelRatio) &&
          message.bytes instanceof Uint8Array &&
          message.bytes.length <= maxThumbnailBytes &&
          isWebp(message.bytes)
        ) {
          await this.access.thumbnails
            .write(
              this.thumbnailKeyOf(listed, message.box, message.pixelRatio),
              message.bytes,
            )
            .catch(() => undefined);
        }
        return undefined;
      }
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
        const shown = this.diskPane(
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
        this.turnDuplicates(page, message);
        return undefined;
      default:
        return message satisfies never;
    }
  }

  dropped(page: Page, files: unknown, message: unknown): Promise<void> {
    const shown = isDrop(message)
      ? this.diskPane(page, message.tab, message.side, message.folder)
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
        tab.view === true && tab.root !== undefined
          ? {
              name: path.basename(tab.root),
              icon: viewerIconUrl(tab.id, tab.root),
            }
          : { name: strings.tools.commander },
      ]),
    );
  }

  fits(folder: string): Promise<boolean> {
    return isFolder(folder);
  }

  folderOf(tab: Tab): string | undefined {
    if (tab.view === true && tab.root !== undefined) {
      return path.dirname(tab.root);
    }
    const panes = this.panes.get(tab.id);
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

  quitNote(): string | undefined {
    const notes = [
      ...(this.transfers.busy() ? [strings.commander.quitStopsTransfers] : []),
      ...(this.updatesAsked.size > 0
        ? [strings.commander.quitDropsChanges]
        : []),
    ];
    return notes.length === 0 ? undefined : notes.join(' ');
  }

  quit(): void {
    this.transfers.quit();
    for (const stop of this.copiesWatched) {
      stop();
    }
    this.copiesWatched.clear();
    for (const pane of this.allPanes()) {
      this.endFlat(pane);
    }
    for (const page of this.shown.keys()) {
      this.stopShowing(page);
    }
    this.elevated?.close();
  }

  async file(url: URL, range: string | null): Promise<Response> {
    const asked = viewedFileOf(url);
    if (asked !== undefined && isPdf(asked.file)) {
      const viewer = this.shell
        .tabs()
        .some(
          (tab) =>
            tab.id === asked.tab &&
            tab.view === true &&
            tab.root === asked.file,
        );
      return viewer
        ? fileResponse(asked.file, pdfType, range).catch(
            () => new Response(null, { status: 404 }),
          )
        : new Response(null, { status: 404 });
    }
    const viewer =
      asked &&
      this.shell
        .tabs()
        .find((tab) => tab.id === asked.tab && tab.view === true);
    const type = asked && imageType(asked.file);
    if (
      !asked ||
      viewer?.root === undefined ||
      !type ||
      !path.isAbsolute(asked.file) ||
      !onSameVolume(asked.file, viewer.root)
    ) {
      return new Response(null, { status: 404 });
    }
    try {
      const stats = await fs.promises.stat(asked.file);
      if (!stats.isFile()) {
        return new Response(null, { status: 404 });
      }
      if (stats.size > maxImageSize) {
        return new Response(null, { status: 413 });
      }
      const body = await fs.promises.readFile(asked.file);
      return new Response(new Uint8Array(body), {
        headers: { 'content-type': type, 'cache-control': 'no-store' },
      });
    } catch {
      return new Response(null, { status: 404 });
    }
  }

  async icon(url: URL): Promise<Response> {
    const viewer = viewerOfIcon(url);
    if (viewer !== undefined) {
      const tab = this.shell
        .tabs()
        .find(
          (each) =>
            each.id === viewer.tab &&
            each.view === true &&
            each.root === viewer.file,
        );
      return tab?.root === undefined
        ? new Response(null, { status: 404 })
        : this.iconResponse(tab.root);
    }
    const source = iconSourceOf(url);
    const pane = source && this.panes.get(source.tab)?.[source.side];
    const entry = listedIn(pane, source?.name);
    if (
      source === undefined ||
      pane === undefined ||
      pane.folder !== source.folder ||
      entry === undefined ||
      entry.folder
    ) {
      return new Response(null, { status: 404 });
    }
    return this.iconResponse(
      path.join(pane.folder, source.name),
      iconTicketOf(url),
    );
  }

  private encryptedInArchive(listed: {
    readonly pane: Pane;
    readonly name: string;
  }): boolean {
    return (
      listed.pane.archive !== undefined &&
      this.archiveItems(listed.pane, [listed.name])?.encrypted === true
    );
  }

  private listedImage(
    tab: unknown,
    side: unknown,
    folder: unknown,
    name: unknown,
  ):
    | {
        readonly file: string;
        readonly entry: Entry;
        readonly type: string;
        readonly pane: Pane;
        readonly name: string;
      }
    | undefined {
    const pane =
      typeof tab === 'string' && isSide(side)
        ? this.panes.get(tab)?.[side]
        : undefined;
    const entry =
      pane !== undefined && pane.folder === folder
        ? listedIn(pane, name)
        : undefined;
    const type = entry && imageType(entry.name);
    return pane === undefined ||
      entry === undefined ||
      typeof name !== 'string' ||
      entry.folder ||
      type === undefined
      ? undefined
      : { file: path.join(pane.folder, name), entry, type, pane, name };
  }

  private thumbnailKeyOf(
    { file, entry }: { readonly file: string; readonly entry: Entry },
    box: number,
    pixelRatio: number,
  ): string {
    return thumbnailKey(
      file,
      entry.size ?? 0,
      entry.modified ?? 0,
      box,
      pixelRatio,
    );
  }

  async thumbnail(url: URL): Promise<Response> {
    const source = thumbnailSourceOf(url);
    const listed =
      source &&
      this.listedImage(source.tab, source.side, source.folder, source.name);
    const archived =
      listed?.pane.archive === undefined
        ? undefined
        : this.archiveItems(listed.pane, [listed.name]);
    const encrypted = archived?.encrypted === true;
    if (
      listed === undefined ||
      (listed.pane.archive !== undefined && archived === undefined) ||
      (encrypted && !archived.archives.hasPassword(archived.archive.file))
    ) {
      return new Response(null, { status: 404 });
    }
    const boxed = thumbnailBoxOf(url);
    if (fillsThumbnail(url)) {
      const skipped =
        boxed &&
        (await this.notFilled(
          listed,
          boxed,
          archived?.archive.source ?? listed.file,
          encrypted,
        ));
      if (boxed === undefined || skipped !== undefined) {
        return new Response(null, { status: skipped ?? 404 });
      }
    }
    const made =
      boxed === undefined || encrypted
        ? undefined
        : await this.access.thumbnails.read(
            this.thumbnailKeyOf(listed, boxed.box, boxed.pixelRatio),
          );
    if (made !== undefined) {
      return new Response(new Uint8Array(made), {
        headers: { 'content-type': 'image/webp', [madeThumbnailHeader]: '1' },
      });
    }
    if ((listed.entry.size ?? 0) > maxImageSize) {
      return new Response(null, { status: 413 });
    }
    if (archived !== undefined) {
      return this.archivedImage(archived, listed.type);
    }
    return fileResponse(listed.file, listed.type, null).catch(
      () => new Response(null, { status: 404 }),
    );
  }

  private async archivedImage(
    {
      archives,
      archive,
      paths: [item],
      encrypted,
    }: {
      readonly archives: ArchiveAccess;
      readonly archive: OpenedArchive;
      readonly paths: readonly string[];
      readonly encrypted: boolean;
    },
    type: string,
  ): Promise<Response> {
    if (
      item === undefined ||
      (encrypted && !archives.hasPassword(archive.file))
    ) {
      return new Response(null, { status: 404 });
    }
    this.archiveImages ??= new ArchiveImages(archives);
    const bytes = await this.archiveImages.read(archive, item);
    return bytes === undefined
      ? new Response(null, { status: 404 })
      : new Response(new Uint8Array(bytes), {
          headers: { 'content-type': type },
        });
  }

  private async notFilled(
    listed: { readonly file: string; readonly entry: Entry },
    { box, pixelRatio }: ThumbnailBox,
    read: string,
    encrypted: boolean,
  ): Promise<number | undefined> {
    if (
      !encrypted &&
      (await this.access.thumbnails.has(
        this.thumbnailKeyOf(listed, box, pixelRatio),
      ))
    ) {
      return storedStatus;
    }
    if (
      listed.entry.online === true ||
      (await this.access.streamed?.(read)) === true
    ) {
      return onlineStatus;
    }
    return (await this.access.thumbnails.full()) ? fullStatus : undefined;
  }

  private async iconResponse(file: string, ticket?: string): Promise<Response> {
    try {
      const png = await this.icons.of(file, ticket);
      return new Response(Buffer.from(png), {
        headers: { 'content-type': 'image/png' },
      });
    } catch {
      return new Response(null, { status: 404 });
    }
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

  private shownPane(
    page: Page,
    tab: unknown,
    side: unknown,
  ): ShownPane | undefined {
    const shown = this.shown.get(page)?.tab;
    if (shown === undefined || shown !== tab || !isSide(side)) {
      return undefined;
    }
    const pane = this.panes.get(shown)?.[side];
    return pane && { tab: shown, side, pane };
  }

  private namingPane(
    page: Page,
    tab: unknown,
    side: unknown,
    folder: unknown,
  ): ShownPane | undefined {
    const shown = this.shownPane(page, tab, side);
    return shown?.pane.folder === folder ? shown : undefined;
  }

  private diskPane(
    page: Page,
    tab: unknown,
    side: unknown,
    folder: unknown,
  ): ShownPane | undefined {
    const shown = this.namingPane(page, tab, side, folder);
    return shown?.pane.archive === undefined ? shown : undefined;
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
      const [copy] = (await this.copiesIn(page, shown.pane, [name])) ?? [];
      if (copy === undefined) {
        return;
      }
      const putBack = this.putBackOf(folder, name, copy);
      if (putBack === undefined) {
        await fs.promises.chmod(copy, 0o444);
      } else {
        await this.watchCopy(putBack, copy);
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

  private archiveItems(
    pane: Pane,
    names: readonly string[],
  ):
    | {
        readonly archives: ArchiveAccess;
        readonly archive: OpenedArchive;
        readonly inner: readonly string[];
        readonly paths: readonly string[];
        readonly withoutFolders: boolean;
        readonly files: number;
        readonly bytes: number;
        readonly encrypted: boolean;
      }
    | undefined {
    const { archives } = this.access;
    const inside = archives?.within(pane.folder);
    if (archives === undefined || inside === undefined) {
      return undefined;
    }
    const items = names.flatMap((name) => {
      const parts = name.split(path.sep);
      const last = parts.at(-1) ?? name;
      const inner = [...inside.inner, ...parts.slice(0, -1)];
      const item = inside.archive.tree.item(inner, last);
      return item === undefined ? [] : [{ name, inner, last, ...item }];
    });
    if (items.length !== names.length) {
      return undefined;
    }
    return {
      archives,
      archive: inside.archive,
      inner: inside.inner,
      paths: items.map((item) => item.path),
      withoutFolders: pane.flat !== undefined,
      ...inside.archive.tree.totals(
        items.map((item) => ({ inner: item.inner, name: item.last })),
      ),
    };
  }

  private async copiesIn(
    page: Page,
    pane: Pane,
    names: readonly string[],
    into?: string,
  ): Promise<string[] | undefined> {
    const found = this.archiveItems(pane, names);
    if (found === undefined) {
      return undefined;
    }
    const { archives, archive, inner, paths, withoutFolders, encrypted } =
      found;
    if (
      encrypted &&
      !archives.hasPassword(archive.file) &&
      !(await this.passwordGiven(page, archive.file, false))
    ) {
      return undefined;
    }
    for (;;) {
      const extracted = await archives.extract(archive, paths, {
        ...(into !== undefined && { into }),
        withoutFolders,
      });
      if (extracted.kind === 'extracted') {
        return itemsAt(extracted.folder, withoutFolders ? 0 : inner.length);
      }
      if (extracted.needsPassword !== true) {
        this.refuse(page, strings.commander.couldNotExtract(extracted.reason));
        return undefined;
      }
      if (
        !(await this.passwordGiven(
          page,
          archive.file,
          archives.hasPassword(archive.file),
        ))
      ) {
        return undefined;
      }
    }
  }

  private async passwordGiven(
    page: Page,
    file: string,
    wrong: boolean,
  ): Promise<boolean> {
    const { archives } = this.access;
    if (archives === undefined) {
      return false;
    }
    archives.usePassword(file, undefined);
    this.cancelPasswords(page);
    const ask = ++this.passwordAsks;
    const password = await new Promise<string | undefined>((resolve) => {
      this.passwordsAsked.set(ask, { page, answer: resolve });
      this.post(page, {
        type: 'askPassword',
        ask,
        name: path.basename(file),
        wrong,
      });
    });
    if (password === undefined) {
      return false;
    }
    archives.usePassword(file, password);
    return true;
  }

  private cancelPasswords(of: Page): void {
    for (const [ask, { page, answer }] of this.passwordsAsked) {
      if (page === of || page.disposed) {
        this.passwordsAsked.delete(ask);
        answer(undefined);
      }
    }
  }

  private answerPassword(ask: unknown, password: unknown): void {
    if (
      typeof ask !== 'number' ||
      (password !== undefined && typeof password !== 'string')
    ) {
      return;
    }
    const asked = this.passwordsAsked.get(ask);
    if (asked !== undefined) {
      this.passwordsAsked.delete(ask);
      asked.answer(password);
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
      (await this.copiesIn(
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
    const inArchive = this.namingPane(page, tab, side, named);
    if (inArchive?.pane.archive !== undefined) {
      this.deleteInArchive(page, inArchive, names);
      return;
    }
    const shown = this.diskPane(page, tab, side, named);
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

  private deleteInArchive(page: Page, shown: ShownPane, names: unknown): void {
    const { pane } = shown;
    if (
      !Array.isArray(names) ||
      names.length === 0 ||
      !names.every((name: unknown) => listedIn(pane, name) !== undefined)
    ) {
      return;
    }
    const found = this.archiveItems(pane, names);
    if (found === undefined) {
      return;
    }
    const { archives, archive, paths } = found;
    if (this.changeable(page, archive)) {
      this.archiveChange(shown, archive, names, 'delete', (options) =>
        archives.remove(archive, paths, options),
      );
    }
  }

  private changeable(page: Page, archive: OpenedArchive): boolean {
    const refusal = this.access.archives?.unchangeable(archive);
    if (refusal === undefined) {
      return true;
    }
    this.refuse(page, refusal);
    return false;
  }

  private putBackOf(
    folder: string,
    name: string,
    copy: string,
  ):
    | {
        readonly archives: ArchiveAccess;
        readonly archive: OpenedArchive;
        readonly inner: readonly string[];
      }
    | undefined {
    const { archives } = this.access;
    const inside = archives?.within(folder);
    const parts = name.split(path.sep);
    const last = parts.at(-1) ?? name;
    const inner = [...(inside?.inner ?? []), ...parts.slice(0, -1)];
    return archives !== undefined &&
      inside !== undefined &&
      archives.unchangeable(inside.archive) === undefined &&
      path.basename(copy) === last &&
      inside.archive.tree.item(inner, last)?.path === [...inner, last].join('/')
      ? { archives, archive: inside.archive, inner }
      : undefined;
  }

  private async watchCopy(
    {
      archives,
      archive,
      inner,
    }: {
      readonly archives: ArchiveAccess;
      readonly archive: OpenedArchive;
      readonly inner: readonly string[];
    },
    copy: string,
  ): Promise<void> {
    const stampNow = () =>
      fs.promises.stat(copy).then(
        (stats) => `${stats.size}:${stats.mtimeMs}`,
        () => undefined,
      );
    const name = [...inner, path.basename(copy)].join(path.sep);
    let stamp = await stampNow();
    let busy = false;
    let again = false;
    const changed = async () => {
      if (busy) {
        again = true;
        return;
      }
      busy = true;
      try {
        do {
          again = false;
          const now = await stampNow();
          if (now !== undefined && now !== stamp) {
            const update = await this.updateWanted(
              name,
              path.basename(archive.file),
            );
            stamp = (await stampNow()) ?? now;
            if (update) {
              this.putBack(archives, archive, inner, copy, name);
            }
          }
        } while (again);
      } finally {
        busy = false;
      }
    };
    this.copiesWatched.add(
      this.access.watch(path.dirname(copy), () => {
        void this.shell.track(changed());
      }),
    );
  }

  private updateWanted(name: string, archive: string): Promise<boolean> {
    return new Promise((answer) => {
      this.updatesAsked.set(++this.updateAsks, { name, archive, answer });
      if (this.updatesAsked.size === 1) {
        this.askNextUpdate();
      }
    });
  }

  private askNextUpdate(): void {
    const [next] = this.updatesAsked;
    if (next === undefined) {
      this.updateAskedIn = undefined;
      return;
    }
    const page = this.pageToAsk();
    this.updateAskedIn = page;
    if (page !== undefined) {
      const [ask, { name, archive }] = next;
      this.post(page, { type: 'askUpdate', ask, name, archive });
    }
  }

  private pageToAsk(): Page | undefined {
    const asked = this.updateAskedIn;
    if (asked !== undefined && this.shown.has(asked)) {
      return asked;
    }
    const focused = this.shell.page();
    if (focused !== undefined && this.shown.has(focused)) {
      return focused;
    }
    return [...this.shown.keys()].at(0);
  }

  private answerUpdate(ask: unknown, update: unknown): void {
    if (typeof ask !== 'number' || typeof update !== 'boolean') {
      return;
    }
    const asked = this.updatesAsked.get(ask);
    if (asked === undefined) {
      return;
    }
    this.updatesAsked.delete(ask);
    asked.answer(update);
    this.askNextUpdate();
  }

  private putBack(
    archives: ArchiveAccess,
    archive: OpenedArchive,
    inner: readonly string[],
    copy: string,
    name: string,
  ): void {
    this.transfers.start(
      {
        plan: {
          sources: [archive.file],
          target: path.dirname(archive.file),
          move: false,
        },
        folder: path.join(archive.file, ...inner),
        names: [name],
        archive: { job: 'update', file: archive.file },
      },
      archiveJob(path.basename(archive.file), (options) =>
        archives.addItems(
          archive,
          inner,
          path.dirname(copy),
          [path.basename(copy)],
          options,
        ),
      ),
    );
  }

  private takenIn(
    page: Page,
    archive: OpenedArchive,
    inner: readonly string[],
    name: string,
    except?: string,
  ): boolean {
    const key = (each: string) => folderKey(each, this.access.platform);
    const taken =
      archive.tree
        .entries(inner)
        ?.some(
          (entry) =>
            key(entry.name) === key(name) &&
            (except === undefined || key(entry.name) !== key(except)),
        ) === true;
    if (taken) {
      this.shell.notice(page, {
        level: 'error',
        message: strings.commander.nameTaken(name),
      });
    }
    return taken;
  }

  private archiveChange(
    shown: ShownPane,
    archive: OpenedArchive,
    names: readonly string[],
    job: ArchiveJob,
    run: (options: PackOptions) => Promise<Packing>,
    select?: string,
  ): void {
    this.transfers.start(
      {
        plan: {
          sources: [archive.file],
          target: path.dirname(archive.file),
          move: false,
        },
        folder: shown.pane.folder,
        names,
        archive: {
          job,
          file: archive.file,
          ...(select !== undefined &&
            shown.pane.flat === undefined && { select }),
        },
      },
      archiveJob(path.basename(archive.file), run),
    );
  }

  private renameInArchive(
    page: Page,
    shown: ShownPane,
    name: unknown,
    to: unknown,
  ): void {
    const { pane } = shown;
    if (
      typeof name !== 'string' ||
      listedIn(pane, name) === undefined ||
      typeof to !== 'string' ||
      to !== path.basename(to) ||
      nameProblem(to, this.access.platform) !== undefined
    ) {
      return;
    }
    const found = this.archiveItems(pane, [name]);
    const [from] = found?.paths ?? [];
    if (found === undefined || from === undefined) {
      return;
    }
    const { archives, archive } = found;
    const parts = name.split(path.sep);
    const inner = [...found.inner, ...parts.slice(0, -1)];
    if (
      !this.changeable(page, archive) ||
      this.takenIn(page, archive, inner, to, parts.at(-1))
    ) {
      return;
    }
    const slash = from.lastIndexOf('/');
    const renamed = slash < 0 ? to : `${from.slice(0, slash)}/${to}`;
    this.archiveChange(
      shown,
      archive,
      [name],
      'rename',
      (options) => archives.rename(archive, from, renamed, options),
      to,
    );
  }

  private folderInArchive(page: Page, shown: ShownPane, name: unknown): void {
    const { archives } = this.access;
    const inside = archives?.within(shown.pane.folder);
    if (
      archives === undefined ||
      inside === undefined ||
      typeof name !== 'string' ||
      name !== path.basename(name) ||
      nameProblem(name, this.access.platform) !== undefined
    ) {
      return;
    }
    const { archive, inner } = inside;
    if (
      !this.changeable(page, archive) ||
      this.takenIn(page, archive, inner, name)
    ) {
      return;
    }
    this.archiveChange(
      shown,
      archive,
      [name],
      'folder',
      (options) => archives.addFolder(archive, inner, name, options),
      name,
    );
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
    const shown = this.namingPane(page, tab, side, folder);
    const other = shown && this.panes.get(shown.tab)?.[otherSide(shown.side)];
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
    if (kept.length === 0 || !this.changeable(page, archive)) {
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
    const found = this.archiveItems(shown.pane, kept);
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
      !this.changeable(page, into.archive) ||
      (move && !this.changeable(page, archive))
    ) {
      return;
    }
    if (
      encrypted &&
      !archives.hasPassword(archive.file) &&
      !(await this.passwordGiven(page, archive.file, false))
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
    const found = this.archiveItems(pane, names);
    if (
      found === undefined ||
      (move && !this.changeable(page, found.archive))
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
      !(await this.passwordGiven(page, archive.file, false))
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
    this.post(page, {
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
    const shown = this.diskPane(page, tab, side, folder);
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
    const shown = this.namingPane(page, tab, side, folder);
    if (
      shown?.pane.archive !== undefined &&
      Array.isArray(names) &&
      names.length > 0 &&
      names.every((name: unknown) => listedIn(shown.pane, name) !== undefined)
    ) {
      const copies = await this.copiesIn(page, shown.pane, names);
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
    const shown = this.diskPane(page, tab, side, folder);
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

  private async newFolder(
    page: Page,
    {
      tab,
      side,
      folder,
      name,
    }: Extract<CommanderToHost, { type: 'newFolder' }>,
  ): Promise<void> {
    const inArchive = this.namingPane(page, tab, side, folder);
    if (inArchive?.pane.archive !== undefined) {
      this.folderInArchive(page, inArchive, name);
      return;
    }
    const shown = this.diskPane(page, tab, side, folder);
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
    const shown = this.diskPane(page, tab, side, folder);
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
            !(await this.passwordGiven(page, file, archives.hasPassword(file)))
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
    const shown = this.diskPane(page, tab, side, folder);
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
    const first = volumeBytes === undefined ? archive : `${archive}.001`;
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
    const inArchive = this.namingPane(page, tab, side, folder);
    if (inArchive?.pane.archive !== undefined) {
      this.renameInArchive(page, inArchive, name, to);
      return;
    }
    const shown = this.diskPane(page, tab, side, folder);
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
    for (const [page, showing] of this.shown) {
      this.transferredIn(page, showing.tab, ask);
    }
  }

  private transferredIn(
    page: Page,
    tab: string,
    { plan, folder, names, archive }: TransferAsk,
  ): void {
    const panes = this.panes.get(tab);
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
    const shown = this.diskPane(page, tab, side, folder);
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
    const shown = this.diskPane(page, tab, side, folder);
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
      const shown = this.namingPane(page, tab, side, folder);
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
          : ((await this.copiesIn(page, pane, [name])) ?? []);
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

  private async startViewing(
    page: Page,
    tab: string,
    file: string,
  ): Promise<void> {
    const showing = this.shown.get(page);
    if (showing === undefined) {
      return;
    }
    const asked = ++showing.viewingsAsked;
    const current = () =>
      this.shown.get(page) === showing &&
      showing.viewingsAsked === asked &&
      showing.tab === tab;
    let size: number;
    let version: string;
    let binary: boolean;
    let detected: TextEncoding | undefined;
    let hidden: readonly boolean[];
    try {
      const stats = await fs.promises.stat(file);
      hidden = await this.hiddenParts(file);
      size = stats.size;
      version = fileVersion(stats);
      const first = await firstBytes(file);
      binary = looksBinary(first);
      detected =
        byteOrderMarkOf(first) ??
        utf16Order(first) ??
        (binary || isUtf8(first) ? undefined : await this.access.codePage());
    } catch (error) {
      if (current()) {
        this.post(page, {
          type: 'viewing',
          tab,
          size: undefined,
          error: strings.commander.couldNotRead(file, reasonOf(error)),
        });
      }
      return;
    }
    if (!current()) {
      return;
    }
    const viewing = {
      tab,
      file,
      size,
      binary,
      blocks: blockCache(),
      stop: this.access.watch(file, () => {
        void fs.promises.stat(file).then(
          (stats) => {
            if (
              showing.viewing === viewing &&
              this.shown.get(page) === showing
            ) {
              viewing.blocks.forget();
              viewing.size = stats.size;
              this.post(page, {
                type: 'viewing',
                tab,
                size: stats.size,
                version: fileVersion(stats),
                binary,
                hidden,
                ...(detected !== undefined && { detected }),
              });
            }
          },
          (error: unknown) => {
            if (
              showing.viewing === viewing &&
              this.shown.get(page) === showing
            ) {
              this.post(page, {
                type: 'viewing',
                tab,
                size: undefined,
                error: strings.commander.couldNotRead(file, reasonOf(error)),
              });
            }
          },
        );
      }),
    };
    showing.finding?.abort();
    showing.finding = undefined;
    showing.viewing = viewing;
    if (isPdf(file)) {
      this.pdfTabs.set(tab, file);
    }
    this.post(page, {
      type: 'viewing',
      tab,
      size,
      version,
      binary,
      hidden,
      ...(detected !== undefined && { detected }),
    });
  }

  private async readBytes(
    page: Page,
    message: Extract<CommanderToHost, { type: 'readBytes' }>,
  ): Promise<void> {
    const viewing = this.shown.get(page)?.viewing;
    const { tab, request, start, length } = message;
    if (
      viewing === undefined ||
      viewing.tab !== tab ||
      !Number.isSafeInteger(request) ||
      !Number.isSafeInteger(start) ||
      start < 0 ||
      !Number.isInteger(length) ||
      length < 0 ||
      length > maxBytesAsked
    ) {
      return;
    }
    const { blocks } = viewing;
    try {
      const data = await readingFile(viewing.file, (read) =>
        blocks.reader(read)(start, length),
      );
      this.post(page, { type: 'bytes', tab, request, start, data: [...data] });
    } catch (error) {
      if (this.shown.get(page)?.viewing === viewing) {
        this.post(page, {
          type: 'viewing',
          tab,
          size: undefined,
          error: strings.commander.couldNotRead(viewing.file, reasonOf(error)),
        });
      }
    }
  }

  private async readText(
    page: Page,
    { tab, request, encoding }: Extract<CommanderToHost, { type: 'readText' }>,
  ): Promise<void> {
    const viewing = this.shown.get(page)?.viewing;
    if (
      viewing === undefined ||
      viewing.tab !== tab ||
      !Number.isSafeInteger(request) ||
      !isTextEncoding(encoding)
    ) {
      return;
    }
    const text =
      viewing.size > maxColoredBytes
        ? undefined
        : await fs.promises
            .readFile(viewing.file)
            .then((bytes) =>
              new TextDecoder(encoding, { ignoreBOM: true }).decode(bytes),
            )
            .catch(() => undefined);
    this.post(page, { type: 'text', tab, request, text });
  }

  private viewedPdf(page: Page, tab: unknown, fingerprint: unknown) {
    const viewing = this.shown.get(page)?.viewing;
    return viewing !== undefined &&
      viewing.tab === tab &&
      isPdf(viewing.file) &&
      isPdfFingerprint(fingerprint)
      ? { file: viewing.file, fingerprint }
      : undefined;
  }

  private async readPdfPlace(
    page: Page,
    {
      tab,
      fingerprint,
      request,
    }: Extract<CommanderToHost, { type: 'readPdfPlace' }>,
  ): Promise<void> {
    const viewed = this.viewedPdf(page, tab, fingerprint);
    if (viewed === undefined || !Number.isSafeInteger(request)) {
      return;
    }
    const place = await this.access.pdfPlaces
      .of(viewed.fingerprint)
      .catch(() => undefined);
    this.post(page, {
      type: 'pdfPlace',
      tab,
      request,
      ...(place !== undefined && { place }),
    });
  }

  private async savePdfPlace(
    _page: Page,
    {
      tab,
      fingerprint,
      place,
    }: Extract<CommanderToHost, { type: 'savePdfPlace' }>,
  ): Promise<void> {
    const file = typeof tab === 'string' ? this.pdfTabs.get(tab) : undefined;
    const checked = pdfPlaceOf(place);
    if (
      file === undefined ||
      !isPdfFingerprint(fingerprint) ||
      checked === undefined
    ) {
      return;
    }
    await this.access.pdfPlaces
      .save(fingerprint, checked, file)
      .catch(() => undefined);
  }

  private async findText(
    page: Page,
    {
      tab,
      request,
      encoding,
      query,
    }: Extract<CommanderToHost, { type: 'findText' }>,
  ): Promise<void> {
    const showing = this.shown.get(page);
    const viewing = showing?.viewing;
    if (
      showing === undefined ||
      viewing === undefined ||
      viewing.tab !== tab ||
      !Number.isSafeInteger(request) ||
      !isTextEncoding(encoding) ||
      typeof query !== 'string' ||
      query.length > maxFindLength
    ) {
      return;
    }
    showing.finding?.abort();
    const finding = new AbortController();
    showing.finding = finding;
    showing.findingRequest = request;
    let told = Date.now();
    let failed: unknown;
    const found = await readingFile(viewing.file, (read) =>
      findInFile(read, viewing.size, query, encoding, {
        signal: finding.signal,
        onChunk: (matches) => {
          if (Date.now() - told >= findProgressEvery) {
            told = Date.now();
            this.post(page, {
              type: 'found',
              tab,
              request,
              matches: [...matches],
              capped: false,
              done: false,
            });
          }
        },
      }),
    ).catch((error: unknown) => {
      failed = error;
      return undefined;
    });
    if (finding.signal.aborted) {
      return;
    }
    showing.finding = undefined;
    showing.findingRequest = undefined;
    if (found === undefined) {
      if (failed !== undefined && this.shown.get(page)?.viewing === viewing) {
        this.post(page, {
          type: 'viewing',
          tab,
          size: undefined,
          error: strings.commander.couldNotRead(viewing.file, reasonOf(failed)),
        });
      }
      return;
    }
    this.post(page, {
      type: 'found',
      tab,
      request,
      matches: found.matches,
      capped: found.capped,
      done: true,
    });
  }

  private async readRows(
    page: Page,
    message: Extract<CommanderToHost, { type: 'readRows' }>,
  ): Promise<void> {
    const viewing = this.shown.get(page)?.viewing;
    const { request, anchor, exact, before, after, least, encoding } = message;
    const counts = [before, after, least].every(
      (count) => Number.isInteger(count) && count >= 0 && count <= maxRowsAsked,
    );
    if (
      viewing === undefined ||
      viewing.tab !== message.tab ||
      !Number.isSafeInteger(request) ||
      !Number.isSafeInteger(anchor) ||
      anchor < 0 ||
      typeof exact !== 'boolean' ||
      !isTextEncoding(encoding) ||
      !counts
    ) {
      return;
    }
    const { size, blocks } = viewing;
    try {
      const [earlier, later] = await readingFile(
        viewing.file,
        async (direct) => {
          const read = blocks.reader(direct);
          const coding = codingOf(encoding);
          const start = exact
            ? Math.min(anchor, size)
            : await rowStartAt(read, Math.min(anchor, size), coding);
          const budget = { least, bytes: readBudgetBytes };
          return Promise.all([
            rowsBefore(read, size, start, before, coding, budget),
            rowsFrom(read, size, start, after, coding, budget),
          ]);
        },
      );
      this.post(page, {
        type: 'rows',
        tab: viewing.tab,
        request,
        size,
        rows: [...earlier, ...later],
        anchorIndex: earlier.length,
      });
    } catch (error) {
      if (this.shown.get(page)?.viewing === viewing) {
        this.post(page, {
          type: 'viewing',
          tab: viewing.tab,
          size: undefined,
          error: strings.commander.couldNotRead(viewing.file, reasonOf(error)),
        });
      }
    }
  }

  private async elevate(
    page: Page,
    tab: unknown,
    side: unknown,
  ): Promise<void> {
    const shown = this.shownPane(page, tab, side);
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
    for (const [tab, panes] of this.panes) {
      for (const side of sides) {
        const pane = panes[side];
        if (pane.elevated !== true) {
          continue;
        }
        readAsAdministrator = true;
        pane.elevated = false;
        pane.entries = undefined;
        pane.denied = pane.folder;
        const shownIn = this.pageShowing(tab);
        if (shownIn !== undefined) {
          this.postListing(shownIn, tab, side, pane, undefined);
          this.post(shownIn, {
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
    const pane = this.panes.get(tab)?.[side];
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
        this.post(page, {
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
        this.post(page, { type: 'readingArchive', tab, side });
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
          !(await this.passwordGiven(
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
    const shown = this.namingPane(page, tab, side, folder);
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
    const source = this.namingPane(page, tab, from, named);
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
    const shown = this.diskPane(page, tab, side, folder);
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
    if (this.shown.get(page)?.tab === tab) {
      this.post(page, {
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
    const shown = this.shownPane(page, tab, side);
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
    const shown = this.namingPane(page, tab, side, folder);
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
    fallback?: string,
    selecting?: string,
  ): Promise<void> {
    const pane = this.panes.get(tab)?.[side];
    if (pane === undefined) {
      return;
    }
    if (
      pane.flat !== undefined &&
      pane.folder === folder &&
      (how === 'show' || how === 'refresh')
    ) {
      this.postListing(page, tab, side, pane, undefined);
      this.flushFlat(tab, side, pane.flat);
      this.flushDuplicates(tab, side, pane.duplicates);
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
          this.post(page, {
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
      this.endFlat(pane);
      this.endSizing(pane);
      this.endDuplicates(pane);
    }
    if (how === 'visit' || typeof how === 'object' || pane.denied === folder) {
      pane.denied = undefined;
    }
    if (pane.folder !== folder && !listing.elevated) {
      this.saveQuietly(this.savedSides.save(tab, side, folder));
    }
    pane.folder = folder;
    pane.hidden = hidden;
    pane.entries = listing.entries;
    pane.elevated = listing.elevated;
    pane.archive = listing.archive;
    pane.binOff = binOff;
    pane.landed = asked;
    this.postListing(page, tab, side, pane, selected);
    this.feedDuplicates(pane);
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
    const showing = this.shown.get(page);
    if (showing?.tab !== tab) {
      return;
    }
    const pane = this.panes.get(tab)?.[side];
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

  private stopShowing(page: Page): void {
    const showing = this.shown.get(page);
    if (showing === undefined) {
      return;
    }
    this.shown.delete(page);
    for (const { stop } of showing.watching.values()) {
      stop();
    }
    showing.watching.clear();
    showing.viewing?.stop();
    showing.viewing = undefined;
    showing.finding?.abort();
    showing.finding = undefined;
  }

  private pageShowing(tab: string): Page | undefined {
    for (const [page, showing] of this.shown) {
      if (showing.tab === tab) {
        return page;
      }
    }
    return undefined;
  }

  private allPanes(): Pane[] {
    return [...this.panes.values()].flatMap((panes) =>
      sides.map((side) => panes[side]),
    );
  }

  private async turnFlat(
    page: Page,
    { tab, side, flat }: Extract<CommanderToHost, { type: 'flat' }>,
  ): Promise<void> {
    const shown = this.shownPane(page, tab, side);
    if (shown === undefined || typeof flat !== 'boolean') {
      return;
    }
    if (flat && shown.pane.flat === undefined) {
      this.startFlat(page, shown);
    } else if (!flat && shown.pane.flat !== undefined) {
      this.endFlat(shown.pane);
      await this.list(page, shown.tab, shown.side, shown.pane.folder, 'show');
    }
  }

  private startFlat(page: Page, { tab, side, pane }: ShownPane): void {
    this.endFlat(pane);
    this.endSizing(pane);
    const watching = this.shown.get(page)?.watching;
    watching?.get(side)?.stop();
    watching?.delete(side);
    pane.asked++;
    pane.repositoriesAsked++;
    pane.repositories = new Set();
    const { folder } = pane;
    const tree = new FlatTree(
      folder,
      async (each) => (await this.listed(each)).entries,
      () => this.flatChanged(tab, side, flat),
    );
    const flat: Flat = {
      walk: ++this.walks,
      tree,
      stopWatching: () => {},
      told: undefined,
      flushing: undefined,
      flushed: 0,
    };
    pane.flat = flat;
    flat.stopWatching =
      pane.archive === undefined
        ? (this.access.watchTree?.(folder, (changed) => {
            if (changed === undefined) {
              tree.changedAll();
            } else {
              tree.changed(changed);
            }
          }) ?? (() => {}))
        : this.access.watch(pane.archive, () => tree.changedAll());
    this.postListing(page, tab, side, pane, undefined);
    tree.start();
  }

  private endFlat(pane: Pane): void {
    const { flat } = pane;
    if (flat !== undefined) {
      pane.flat = undefined;
      flat.tree.close();
      flat.stopWatching();
      clearTimeout(flat.flushing);
    }
  }

  private flatChanged(tab: string, side: Side, flat: Flat): void {
    flat.flushing ??= setTimeout(
      () => {
        flat.flushing = undefined;
        this.flushFlat(tab, side, flat);
      },
      Math.max(0, flat.flushed + flushEvery - Date.now()),
    );
  }

  private flushFlat(tab: string, side: Side, flat: Flat): void {
    const pane = this.panes.get(tab)?.[side];
    const shownIn = this.pageShowing(tab);
    if (pane?.flat !== flat || shownIn === undefined) {
      return;
    }
    const progress = flat.tree.progress;
    const folders = flat.tree.take();
    if (folders.length === 0 && sameProgress(flat.told, progress)) {
      return;
    }
    flat.told = progress;
    flat.flushed = Date.now();
    for (const part of inParts(folders)) {
      this.post(shownIn, {
        type: 'flatFiles',
        tab,
        side,
        folder: pane.folder,
        walk: flat.walk,
        folders: part,
        progress,
      });
    }
    if (!progress.reading) {
      this.feedDuplicates(pane);
    }
  }

  private turnDuplicates(
    page: Page,
    { tab, side, duplicates }: Extract<CommanderToHost, { type: 'duplicates' }>,
  ): void {
    const shown = this.shownPane(page, tab, side);
    if (
      shown === undefined ||
      typeof duplicates !== 'boolean' ||
      shown.pane.archive !== undefined ||
      duplicates === (shown.pane.duplicates !== undefined)
    ) {
      return;
    }
    if (duplicates) {
      this.startDuplicates(shown);
    } else {
      this.endDuplicates(shown.pane);
    }
    this.postListing(page, shown.tab, shown.side, shown.pane, undefined);
  }

  private startDuplicates({ tab, side, pane }: ShownPane): void {
    const duplicating: Duplicating = {
      look: ++this.looks,
      duplicates: new Duplicates(
        this.access.contentReader ?? hashingHere,
        () => this.duplicatesChanged(tab, side, duplicating),
        { skip: async (file) => (await this.access.streamed?.(file)) === true },
      ),
      flushing: undefined,
      flushed: 0,
    };
    pane.duplicates = duplicating;
    if (pane.flat === undefined || !pane.flat.tree.progress.reading) {
      this.feedDuplicates(pane);
    }
  }

  private feedDuplicates(pane: Pane): void {
    const { duplicates, flat, folder } = pane;
    if (duplicates === undefined) {
      return;
    }
    const files: Iterable<readonly [string, Entry]> =
      flat === undefined
        ? (pane.entries ?? []).map((entry) => [entry.name, entry] as const)
        : flat.tree.filesRead;
    const compared: Compared[] = [];
    for (const [key, entry] of files) {
      if (
        !entry.folder &&
        !entry.link &&
        entry.online !== true &&
        entry.size !== undefined &&
        entry.size > 0
      ) {
        compared.push({
          key,
          file: path.join(folder, key),
          size: entry.size,
          modified: entry.modified,
        });
      }
    }
    duplicates.duplicates.look(compared);
  }

  private endDuplicates(pane: Pane): void {
    const { duplicates } = pane;
    if (duplicates !== undefined) {
      pane.duplicates = undefined;
      duplicates.duplicates.close();
      clearTimeout(duplicates.flushing);
    }
  }

  private duplicatesChanged(
    tab: string,
    side: Side,
    duplicating: Duplicating,
  ): void {
    duplicating.flushing ??= setTimeout(
      () => {
        duplicating.flushing = undefined;
        this.flushDuplicates(tab, side, duplicating);
      },
      Math.max(0, duplicating.flushed + flushEvery - Date.now()),
    );
  }

  private flushDuplicates(
    tab: string,
    side: Side,
    duplicating: Duplicating | undefined,
  ): void {
    const pane = this.panes.get(tab)?.[side];
    const shownIn = this.pageShowing(tab);
    if (
      duplicating === undefined ||
      pane?.duplicates !== duplicating ||
      shownIn === undefined
    ) {
      return;
    }
    duplicating.flushed = Date.now();
    this.post(shownIn, {
      type: 'duplicateGroups',
      tab,
      side,
      folder: pane.folder,
      look: duplicating.look,
      groups: duplicating.duplicates.groups,
      reading: duplicating.duplicates.reading,
    });
  }

  private countSizes(
    page: Page,
    {
      tab,
      side,
      folder,
      names,
    }: Extract<CommanderToHost, { type: 'countSizes' }>,
  ): void {
    const shown = this.diskPane(page, tab, side, folder);
    if (
      shown === undefined ||
      shown.pane.flat !== undefined ||
      !Array.isArray(names) ||
      names.length === 0 ||
      !names.every(
        (name: unknown) =>
          entryNamed(shown.pane.entries, name)?.folder === true,
      )
    ) {
      return;
    }
    shown.pane.sizing ??= this.newSizing(shown);
    shown.pane.sizing.sizes.count(names);
  }

  private newSizing({ tab, side, pane }: ShownPane): Sizing {
    const sizing: Sizing = {
      sizes: new FolderSizes(
        pane.folder,
        (pane.elevated !== true && this.access.sizeWalker) ||
          listingWalker(async (each) => (await this.listed(each)).entries),
        () => this.sizesChanged(tab, side, sizing),
      ),
      flushing: undefined,
      flushed: 0,
    };
    return sizing;
  }

  private endSizing(pane: Pane): void {
    const { sizing } = pane;
    if (sizing !== undefined) {
      pane.sizing = undefined;
      sizing.sizes.close();
      clearTimeout(sizing.flushing);
    }
  }

  private sizesChanged(tab: string, side: Side, sizing: Sizing): void {
    sizing.flushing ??= setTimeout(
      () => {
        sizing.flushing = undefined;
        this.flushSizes(tab, side, sizing);
      },
      Math.max(0, sizing.flushed + flushEvery - Date.now()),
    );
  }

  private flushSizes(tab: string, side: Side, sizing: Sizing): void {
    const pane = this.panes.get(tab)?.[side];
    const shownIn = this.pageShowing(tab);
    if (pane?.sizing !== sizing || shownIn === undefined) {
      return;
    }
    sizing.flushed = Date.now();
    const entries = sizing.sizes.take().flatMap((name) => {
      const entry = entryNamed(pane.entries, name);
      return entry?.folder === true
        ? [sizedEntry(entry, sizing.sizes.of(name))]
        : [];
    });
    if (entries.length > 0) {
      this.post(shownIn, {
        type: 'folderSizes',
        tab,
        side,
        folder: pane.folder,
        entries,
      });
    }
  }

  private postListing(
    page: Page,
    tab: string,
    side: Side,
    pane: Pane,
    selected: string | undefined,
  ): void {
    if (this.shown.get(page)?.tab === tab) {
      this.post(page, {
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
    this.post(page, {
      type: 'drives',
      drives: await (await this.files()).drives(),
    });
  }

  private postSettings(page: Page): void {
    const { showHidden, sort, columns, thumbnailSize, fileColors, bookmarks } =
      this.access.settings();
    this.post(page, {
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
    });
  }

  private post(page: Page, message: CommanderToWebview): void {
    page.post({ type: 'tool', tool: 'commander', message });
  }
}

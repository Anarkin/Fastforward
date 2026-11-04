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
  isTextEncoding,
  maxBytesAsked,
  maxColoredBytes,
  maxRowsAsked,
  type TextEncoding,
  parentFolder,
  sides,
  type CommanderToHost,
  type CommanderToWebview,
  type Entry,
  type Side,
} from '../shared/protocol';
import {
  isColumnWidths,
  isLayout,
  isSort,
  type Layouts,
  type Sorts,
  type ColumnWidths,
  type CommanderSettings,
} from '../shared/settings';
import type { FileSystem } from './fileSystem';
import type { WatchFolder } from './watch';
import {
  imageType,
  isThumbnailBox,
  isWebp,
  madeThumbnailHeader,
  maxImageSize,
  maxThumbnailBytes,
  thumbnailBoxOf,
} from '../../../shared/images';
import { thumbnailKey } from './thumbnailStore';
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
import type { ElevatedFileSystem } from './elevated';
import { Icons } from './icons';
import {
  iconSourceOf,
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
  readonly fileSystem: () => Promise<FileSystem>;
  readonly settings: () => CommanderSettings;
  readonly defaultColumns: () => ColumnWidths;
  readonly saveShowHidden: (shown: boolean) => Promise<void>;
  readonly saveColumns: (columns: ColumnWidths) => Promise<void>;
  readonly saveSorts: (sorts: Sorts) => Promise<void>;
  readonly thumbnails: {
    readonly read: (key: string) => Promise<Uint8Array | undefined>;
    readonly write: (key: string, bytes: Uint8Array) => Promise<void>;
  };
  readonly layouts: () => Layouts;
  readonly saveLayouts: (layouts: Layouts) => Promise<void>;
  readonly watch: WatchFolder;
  readonly fileIcon: (file: string) => Promise<Uint8Array>;
  readonly platform: NodeJS.Platform;
  readonly codePage: () => Promise<TextEncoding>;
  readonly elevate?: () => Promise<ElevatedFileSystem | undefined>;
  readonly realPath: (link: string) => Promise<string>;
  readonly shellMenu?: (
    files: readonly string[],
    at: { readonly x: number; readonly y: number },
    extended: boolean,
  ) => Promise<void>;
  readonly root: string;
}

interface Pane {
  folder: string;
  entries: readonly Entry[] | undefined;
  asked: number;
  history: readonly string[];
  at: number;
  denied?: string;
  elevated?: boolean;
}

type Listing = 'visit' | 'show' | 'refresh' | { readonly at: number };

const maxFindLength = 1000;
const findProgressEvery = 150;
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

class RefusedAsAdministrator extends Error {
  readonly code: unknown;

  constructor(refused: unknown) {
    super(refused instanceof Error ? refused.message : String(refused));
    this.code = codeOf(refused);
  }
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

function volumeOf(file: string): string {
  const { root } = path.parse(path.resolve(file));
  return process.platform === 'win32' ? root.toLowerCase() : root;
}

function onSameVolume(file: string, other: string): boolean {
  return volumeOf(file) === volumeOf(other);
}

export class CommanderTool implements Tool<'commander'> {
  private shell: ShellAccess = unattachedShell;
  private shown: { readonly page: Page; readonly tab: string } | undefined;
  private readonly panes = new Map<string, Panes>();
  private readonly watching = new Map<
    Side,
    {
      readonly folder: string;
      readonly elevated: boolean;
      readonly stop: () => void;
    }
  >();
  private fileSystem: Promise<FileSystem> | undefined;
  private readonly icons: Icons;
  private elevated: ElevatedFileSystem | undefined;
  private viewingsAsked = 0;
  private viewing:
    | {
        readonly tab: string;
        readonly file: string;
        size: number;
        readonly binary: boolean;
        readonly blocks: BlockCache;
        readonly stop: () => void;
      }
    | undefined;
  private elevating: Promise<ElevatedFileSystem | undefined> | undefined;
  private finding: AbortController | undefined;
  private readonly pdfTabs = new Map<string, string>();

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
    if (tab.view === true && tab.root !== undefined) {
      this.post(page, { type: 'show', tab: tab.id, file: tab.root });
      await this.startViewing(page, tab.id, tab.root);
      return;
    }
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
      case 'view':
        return this.view(page, message.tab, message.side, message.name);
      case 'shellMenu':
        return this.shellMenu(page, message);
      case 'compare':
        return this.compare(page, message.tab, message.files);
      case 'readRows':
        return this.readRows(page, message);
      case 'readText':
        return this.readText(page, message);
      case 'findText':
        return this.findText(page, message);
      case 'readPdfPlace':
        return this.readPdfPlace(page, message);
      case 'savePdfPlace':
        return this.savePdfPlace(page, message);
      case 'readBytes':
        return this.readBytes(page, message);
      case 'reread': {
        const shown = this.shownPane(page, message.tab, message.side);
        return shown === undefined
          ? undefined
          : this.list(page, shown.tab, shown.side, shown.pane.folder, 'show');
      }
      case 'openOnSide':
        return this.openOnSide(page, message);
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
          const { column, descending } = message.sort;
          await this.access.saveSorts({
            ...this.access.settings().sort,
            [message.side]: { column, descending },
          });
          this.postSettings(page);
        }
        return undefined;
      case 'layout':
        if (isSide(message.side) && isLayout(message.layout)) {
          await this.access.saveLayouts({
            ...this.access.layouts(),
            [message.side]: message.layout,
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
          isThumbnailBox(message.box, message.pixelRatio) &&
          message.bytes instanceof Uint8Array &&
          message.bytes.length <= maxThumbnailBytes &&
          isWebp(message.bytes)
        ) {
          await this.access.thumbnails.write(
            this.thumbnailKeyOf(listed, message.box, message.pixelRatio),
            message.bytes,
          );
        }
        return undefined;
      }
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
    return this.iconResponse(path.join(pane.folder, entry.name));
  }

  private listedImage(
    tab: unknown,
    side: unknown,
    folder: unknown,
    name: unknown,
  ):
    | { readonly file: string; readonly entry: Entry; readonly type: string }
    | undefined {
    const pane =
      typeof tab === 'string' && isSide(side)
        ? this.panes.get(tab)?.[side]
        : undefined;
    const entry =
      pane !== undefined && pane.folder === folder
        ? pane.entries?.find((each) => each.name === name)
        : undefined;
    const type = entry && imageType(entry.name);
    return pane === undefined ||
      entry === undefined ||
      entry.folder ||
      type === undefined
      ? undefined
      : { file: path.join(pane.folder, entry.name), entry, type };
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
    if (listed === undefined) {
      return new Response(null, { status: 404 });
    }
    const boxed = thumbnailBoxOf(url);
    const made =
      boxed &&
      (await this.access.thumbnails.read(
        this.thumbnailKeyOf(listed, boxed.box, boxed.pixelRatio),
      ));
    if (made !== undefined) {
      return new Response(new Uint8Array(made), {
        headers: { 'content-type': 'image/webp', [madeThumbnailHeader]: '1' },
      });
    }
    if ((listed.entry.size ?? 0) > maxImageSize) {
      return new Response(null, { status: 413 });
    }
    return fileResponse(listed.file, listed.type, null).catch(
      () => new Response(null, { status: 404 }),
    );
  }

  private async iconResponse(file: string): Promise<Response> {
    try {
      const png = await this.icons.of(file);
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

  private async openEntry(
    page: Page,
    tab: unknown,
    side: unknown,
    name: unknown,
  ): Promise<void> {
    const shown = this.shownPane(page, tab, side);
    if (shown === undefined || typeof name !== 'string') {
      return;
    }
    const { folder, entries } = shown.pane;
    if (name === parentFolder) {
      const parent = parentOf(folder);
      if (parent !== undefined) {
        await this.list(page, shown.tab, shown.side, parent, 'visit');
      }
      return;
    }
    const entry = entries?.find((each) => each.name === name);
    if (!entry?.folder) {
      return;
    }
    const opened = path.join(folder, entry.name);
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

  private view(
    page: Page,
    tab: unknown,
    side: unknown,
    name: unknown,
  ): Promise<void> {
    const shown = this.shownPane(page, tab, side);
    const entry =
      typeof name === 'string'
        ? shown?.pane.entries?.find((each) => each.name === name)
        : undefined;
    return shown === undefined || entry === undefined || entry.folder
      ? Promise.resolve()
      : this.shell.openView(
          page,
          'commander',
          path.join(shown.pane.folder, entry.name),
        );
  }

  private async shellMenu(
    page: Page,
    {
      tab,
      side,
      names,
      x,
      y,
      extended,
    }: Extract<CommanderToHost, { type: 'shellMenu' }>,
  ): Promise<void> {
    const shown = this.shownPane(page, tab, side);
    const listed = new Set(shown?.pane.entries?.map((entry) => entry.name));
    if (
      shown === undefined ||
      !Array.isArray(names) ||
      names.length === 0 ||
      !names.every(
        (name: unknown) => typeof name === 'string' && listed.has(name),
      ) ||
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      typeof extended !== 'boolean'
    ) {
      return;
    }
    await this.access.shellMenu?.(
      names.map((name: string) => path.join(shown.pane.folder, name)),
      { x, y },
      extended,
    );
  }

  private compare(page: Page, tab: unknown, files: unknown): Promise<void> {
    if (!Array.isArray(files) || files.length !== 2) {
      return Promise.resolve();
    }
    const paths = files.map((file: unknown) => {
      if (typeof file !== 'object' || file === null) {
        return undefined;
      }
      const side = 'side' in file ? file.side : undefined;
      const name = 'name' in file ? file.name : undefined;
      const shown = this.shownPane(page, tab, side);
      const entry =
        typeof name === 'string'
          ? shown?.pane.entries?.find((each) => each.name === name)
          : undefined;
      return shown === undefined || entry === undefined || entry.folder
        ? undefined
        : path.join(shown.pane.folder, entry.name);
    });
    const [old, changed] = paths;
    return old === undefined || changed === undefined
      ? Promise.resolve()
      : this.shell.openCompare(page, 'git', { old, new: changed });
  }

  private async startViewing(
    page: Page,
    tab: string,
    file: string,
  ): Promise<void> {
    const asked = ++this.viewingsAsked;
    const current = () =>
      this.viewingsAsked === asked && this.shown?.tab === tab;
    let size: number;
    let version: string;
    let binary: boolean;
    let detected: TextEncoding | undefined;
    try {
      const stats = await fs.promises.stat(file);
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
            if (this.viewing === viewing && this.shown?.tab === tab) {
              viewing.blocks.forget();
              viewing.size = stats.size;
              this.post(page, {
                type: 'viewing',
                tab,
                size: stats.size,
                version: fileVersion(stats),
                binary,
                ...(detected !== undefined && { detected }),
              });
            }
          },
          () => undefined,
        );
      }),
    };
    this.finding?.abort();
    this.finding = undefined;
    this.viewing = viewing;
    if (isPdf(file)) {
      this.pdfTabs.set(tab, file);
    }
    this.post(page, {
      type: 'viewing',
      tab,
      size,
      version,
      binary,
      ...(detected !== undefined && { detected }),
    });
  }

  private async readBytes(
    page: Page,
    message: Extract<CommanderToHost, { type: 'readBytes' }>,
  ): Promise<void> {
    const { viewing } = this;
    const { tab, request, start, length } = message;
    if (
      viewing === undefined ||
      this.shown?.page !== page ||
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
      if (this.viewing === viewing) {
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
    const { viewing } = this;
    if (
      viewing === undefined ||
      this.shown?.page !== page ||
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
    const { viewing } = this;
    return viewing !== undefined &&
      this.shown?.page === page &&
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
    const { viewing } = this;
    if (
      viewing === undefined ||
      this.shown?.page !== page ||
      viewing.tab !== tab ||
      !Number.isSafeInteger(request) ||
      !isTextEncoding(encoding) ||
      typeof query !== 'string' ||
      query.length > maxFindLength
    ) {
      return;
    }
    this.finding?.abort();
    const finding = new AbortController();
    this.finding = finding;
    let told = Date.now();
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
    ).catch(() => ({ matches: [], capped: false }));
    if (found === undefined || finding.signal.aborted) {
      return;
    }
    this.finding = undefined;
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
    const { viewing } = this;
    const { request, anchor, exact, before, after, encoding } = message;
    const counts = [before, after].every(
      (count) => Number.isInteger(count) && count >= 0 && count <= maxRowsAsked,
    );
    if (
      viewing === undefined ||
      this.shown?.page !== page ||
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
          return Promise.all([
            rowsBefore(read, size, start, before, coding),
            rowsFrom(read, size, start, after, coding),
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
      if (this.viewing === viewing) {
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
    if ((this.elevated ?? (await this.elevating)) !== undefined) {
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
        if (page !== undefined && this.shown?.tab === tab) {
          this.postListing(page, tab, side, pane, undefined);
          this.post(page, {
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

  private async listed(folder: string): Promise<{
    readonly entries: readonly Entry[];
    readonly elevated: boolean;
  }> {
    const files = await this.files();
    try {
      return { entries: await files.list(folder), elevated: false };
    } catch (error) {
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

  private openOnSide(
    page: Page,
    { tab, from, side, name }: Extract<CommanderToHost, { type: 'openOnSide' }>,
  ): Promise<void> {
    const source = this.shownPane(page, tab, from);
    if (source === undefined || !isSide(side) || typeof name !== 'string') {
      return Promise.resolve();
    }
    const { folder, entries } = source.pane;
    const entry = entries?.find((each) => each.name === name);
    const target =
      name === parentFolder
        ? parentOf(folder)
        : entry === undefined
          ? undefined
          : entry.folder
            ? path.join(folder, entry.name)
            : folder;
    return target === undefined
      ? Promise.resolve()
      : this.list(page, source.tab, side, target, 'visit');
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
    fallback?: string,
  ): Promise<void> {
    const pane = this.panes.get(tab)?.[side];
    if (pane === undefined) {
      return;
    }
    const asked = how === 'refresh' ? pane.asked : ++pane.asked;
    let listing: Awaited<ReturnType<CommanderTool['listed']>>;
    try {
      listing = await this.listed(folder);
    } catch (error) {
      if (pane.asked !== asked) {
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
        this.postListing(page, tab, side, pane, undefined);
      }
      return;
    }
    if (pane.asked !== asked || (how === 'refresh' && pane.folder !== folder)) {
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
    pane.entries = listing.entries;
    pane.elevated = listing.elevated;
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
    const elevated =
      this.panes.get(tab)?.[side].elevated === true ? this.elevated : undefined;
    const current = this.watching.get(side);
    if (
      current?.folder === folder &&
      current.elevated === (elevated !== undefined)
    ) {
      return;
    }
    current?.stop();
    const watch = elevated?.watch ?? this.access.watch;
    this.watching.set(side, {
      folder,
      elevated: elevated !== undefined,
      stop: watch(folder, () => {
        void this.list(page, tab, side, folder, 'refresh');
      }),
    });
  }

  private unwatch(): void {
    for (const { stop } of this.watching.values()) {
      stop();
    }
    this.watching.clear();
    this.viewing?.stop();
    this.viewing = undefined;
    this.finding?.abort();
    this.finding = undefined;
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
        elevated: pane.elevated === true,
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
    const { showHidden, sort, columns, thumbnailSize } = this.access.settings();
    this.post(page, {
      type: 'settings',
      showHidden,
      sort,
      columns,
      defaultColumns: this.access.defaultColumns(),
      canElevate: this.access.elevate !== undefined,
      layouts: this.access.layouts(),
      thumbnailSize,
    });
  }

  private post(page: Page, message: CommanderToWebview): void {
    page.post({ type: 'tool', tool: 'commander', message });
  }
}

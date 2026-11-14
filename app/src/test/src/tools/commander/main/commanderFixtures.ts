import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Notice, Page, Tab } from '../../../../../shell/main/shell';
import type { Compared, Store } from '../../../../../shell/main/storage';
import type { ToWebview } from '../../../../../shell/shared/protocol';
import type { LocalFileSystem } from '../../../../../tools/commander/main/fileSystem';
import { CommanderTool } from '../../../../../tools/commander/main/tool';
import type {
  CommanderToHost,
  CommanderToWebview,
  Entry,
  Side,
} from '../../../../../tools/commander/shared/protocol';
import type {
  ColumnWidths,
  Sorts,
} from '../../../../../tools/commander/shared/settings';
import type { ElevatedFileSystem } from '../../../../../tools/commander/main/elevated';
import type { SizeWalker } from '../../../../../tools/commander/main/folderSizes';
import {
  ArchiveTree,
  type ArchiveAccess,
  type ArchiveItem,
  type OpenedArchive,
  type PackPlan,
} from '../../../../../tools/commander/main/archives';
import { strings } from '../../../../../lib/shared/strings';
import { pathParts } from '../../../../../tools/commander/shared/paths';
import type { PdfPlace } from '../../../../../tools/commander/shared/pdf';
import { FakeStore } from '../../../../support/fakeStore';
import type { TransferCommand } from '../../../../../tools/commander/main/transferProtocol';
import type { TransferListener } from '../../../../../tools/commander/main/transfers';
import type { TransferPlan } from '../../../../../tools/commander/main/transfer';

export class CommanderPage implements Page {
  readonly messages: CommanderToWebview[] = [];
  disposed = false;

  post(message: ToWebview): void {
    if (message.type === 'tool' && message.tool === 'commander') {
      this.messages.push(message.message);
    }
  }

  of<T extends CommanderToWebview['type']>(
    type: T,
  ): Extract<CommanderToWebview, { readonly type: T }>[] {
    return this.messages.filter(
      (message): message is Extract<CommanderToWebview, { readonly type: T }> =>
        message.type === type,
    );
  }

  listings(): string[] {
    return this.of('listing').map(
      (listing) =>
        `${listing.side} ${listing.folder}${listing.parent ? ' ↑' : ''}: ${listing.entries.map((entry) => entry.name).join(' ')}${listing.selected === undefined ? '' : ` [${listing.selected}]`}`,
    );
  }
}

export const root = path.resolve('/');
export const at = (...names: string[]) => path.join(root, ...names);

export const folder = (name: string): Entry => ({
  name,
  folder: true,
  link: false,
  hidden: false,
  size: undefined,
  modified: 0,
});

export const file = (name: string): Entry => ({
  name,
  folder: false,
  link: false,
  hidden: false,
  size: 1,
  modified: 0,
});

export type Listed = readonly Entry[] | Error | Promise<readonly Entry[]>;

type Naming =
  | 'open'
  | 'view'
  | 'shellMenu'
  | 'delete'
  | 'transfer'
  | 'newFolder'
  | 'copyToClipboard'
  | 'paste'
  | 'drag'
  | 'openRepository'
  | 'folderCommand'
  | 'enterArchive'
  | 'countSizes'
  | 'editFile'
  | 'newFile'
  | 'openOnSide';

type Unnamed<Message> = Message extends { readonly type: Naming }
  ? Omit<Message, 'folder'> & { readonly folder?: string }
  : Message;

export type FromPage = Unnamed<CommanderToHost>;

export function commander(
  listed: Record<string, Listed>,
  drives: readonly string[] = [],
  elevate?: () => Promise<ElevatedFileSystem | undefined>,
  state: Store = new FakeStore(),
) {
  const notices: Notice[] = [];
  const saved: unknown[] = [];
  const watching: {
    folder: string;
    changed: () => void;
    listed: string | undefined;
  }[] = [];
  const listings = new Map<string, number>();
  const watchingTrees: {
    folder: string;
    changed: (changed: string | undefined) => void;
  }[] = [];
  const iconsLoaded: string[] = [];
  const opened: string[] = [];
  const trashed: string[] = [];
  const removed: string[] = [];
  const madeFolders: string[] = [];
  const renamed: (readonly [string, string])[] = [];
  const clipboard: { files: readonly string[] } = { files: [] };
  const dragged: (readonly string[])[] = [];
  const menus: {
    readonly files: readonly string[];
    readonly at: { readonly x: number; readonly y: number };
    readonly extended: boolean;
  }[] = [];
  const settings = {
    showHidden: true,
    sort: defaultSorts,
    columns: defaultColumns,
    thumbnailSize: 144,
    thumbnailCacheMegabytes: 8192,
    fileColors: [],
    bookmarks: [] as readonly string[],
  };
  const thumbnails = new Map<string, Uint8Array>();
  const streamed = new Set<string>();
  const contents: Record<string, string> = {};
  const contentReads: string[] = [];
  const binsOff = new Set<string>();
  const thumbnailsFull = { now: false };
  const closing = { now: false };
  const thumbnailWritesFail = { now: false };
  const repositories = new Set<string>();
  const repositoriesAsked: string[] = [];
  const repositoriesHeld: { until: Promise<unknown> | undefined } = {
    until: undefined,
  };
  const insideRepositories = new Set<string>();
  const clonedInto: string[] = [];
  const initedIn: string[] = [];
  const deletesHeld: { until: Promise<unknown> | undefined } = {
    until: undefined,
  };
  const tracking: Promise<unknown>[] = [];
  const openedIn: { readonly tool: string; readonly folders: string[] }[] = [];
  const transfers: {
    readonly commands: TransferCommand[];
    readonly listener: TransferListener;
    disposed: boolean;
  }[] = [];
  const fileSystem: LocalFileSystem = {
    list: (each) => {
      listings.set(each, (listings.get(each) ?? 0) + 1);
      const found = listed[each];
      if (found === undefined) {
        return Promise.reject(
          Object.assign(new Error(each), { code: 'ENOENT' }),
        );
      }
      return found instanceof Error
        ? Promise.reject(found)
        : Promise.resolve(found);
    },
    drives: () => Promise.resolve(drives),
    hidden: (each) => Promise.resolve(path.basename(each).startsWith('.')),
  };
  const archived = new Map<string, readonly ArchiveItem[] | string>();
  const openedArchives = new Map<string, OpenedArchive>();
  const archivesOf = new WeakMap<readonly ArchiveItem[], OpenedArchive>();
  const copies = { folder: '', refused: undefined as string | undefined };
  let extractions = 0;
  const opensHeld: { until: Promise<unknown> | undefined } = {
    until: undefined,
  };
  const extractsHeld: { until: Promise<unknown> | undefined } = {
    until: undefined,
  };
  const passwords = new Map<string, string>();
  const secrets = new Map<string, string>();
  const extracted: (readonly string[])[] = [];
  const packed: PackPlan[] = [];
  const removedFromArchives: (readonly [string, readonly string[]])[] = [];
  const changedInArchives: unknown[] = [];
  const tested: string[] = [];
  const archiveTests = new Map<string, string>();
  const counting: { walker: SizeWalker | undefined } = { walker: undefined };
  const passwordRight = (archive: string) =>
    !secrets.has(archive) || passwords.get(archive) === secrets.get(archive);
  const archives: ArchiveAccess = {
    usePassword: (archive, password) => {
      if (password === undefined) {
        passwords.delete(archive);
      } else {
        passwords.set(archive, password);
      }
    },
    hasPassword: (archive) => passwords.has(archive),
    pack: (plan) => {
      packed.push(plan);
      return Promise.resolve({ kind: 'packed' });
    },
    remove: (archive, paths) => {
      removedFromArchives.push([archive.file, paths]);
      return Promise.resolve({ kind: 'packed' });
    },
    rename: (archive, from, to) => {
      changedInArchives.push(['rename', archive.file, from, to]);
      return Promise.resolve({ kind: 'packed' });
    },
    addFolder: (archive, inner, name) => {
      changedInArchives.push(['folder', archive.file, inner, name]);
      return Promise.resolve({ kind: 'packed' });
    },
    unchangeable: (archive) =>
      archive.outer !== undefined || archive.source !== archive.file
        ? strings.commander.archiveUnchangeable(path.basename(archive.file))
        : undefined,
    test: (tried) => {
      tested.push(tried);
      const refused = archiveTests.get(tried);
      if (refused === 'locked') {
        return Promise.resolve(
          passwordRight(tried)
            ? { kind: 'packed' }
            : {
                kind: 'refused',
                reason: 'Wrong password',
                needsPassword: true,
              },
        );
      }
      return Promise.resolve(
        refused === undefined
          ? { kind: 'packed' }
          : { kind: 'refused', reason: refused },
      );
    },
    addItems: (archive, inner, from, items) => {
      changedInArchives.push(['add', archive.file, inner, from, items]);
      return Promise.resolve({ kind: 'packed' });
    },
    extract: async (archive, paths, options) => {
      extracted.push(paths);
      await extractsHeld.until;
      const into = options?.into;
      if (copies.refused !== undefined) {
        return { kind: 'refused', reason: copies.refused };
      }
      const items = archived.get(archive.file);
      if (
        typeof items !== 'string' &&
        items?.some(
          (item) =>
            item.encrypted &&
            paths.some(
              (each) => item.path === each || item.path.startsWith(`${each}/`),
            ),
        ) === true &&
        !passwordRight(archive.file)
      ) {
        return {
          kind: 'refused',
          reason: 'Wrong password',
          needsPassword: true,
        };
      }
      assert.notStrictEqual(copies.folder, '', 'a folder for the copies');
      const extractedInto =
        into ?? path.join(copies.folder, `work-${++extractions}`);
      for (const item of typeof items === 'string' ? [] : (items ?? [])) {
        if (
          paths.some(
            (asked) => item.path === asked || item.path.startsWith(`${asked}/`),
          )
        ) {
          const copy =
            options?.withoutFolders === true
              ? path.join(extractedInto, path.posix.basename(item.path))
              : path.join(extractedInto, ...item.path.split('/'));
          await fs.promises.mkdir(path.dirname(copy), { recursive: true });
          await fs.promises.writeFile(copy, `the ${item.path} of the archive`);
        }
      }
      return { kind: 'extracted', folder: extractedInto };
    },
    open: async (opening, signal) => {
      if (opensHeld.until !== undefined) {
        await Promise.race([
          opensHeld.until,
          new Promise((_resolve, reject) =>
            signal?.addEventListener('abort', () =>
              reject(new Error('The operation was aborted')),
            ),
          ),
        ]);
      }
      const known = openedArchives.get(opening);
      if (known?.outer !== undefined) {
        return { kind: 'opened', archive: known };
      }
      const items = archived.get(opening);
      if (
        typeof items !== 'string' &&
        items?.some((item) => item.encrypted) !== true &&
        !passwordRight(opening)
      ) {
        return {
          kind: 'refused',
          reason: 'Cannot open encrypted archive. Wrong password?',
          needsPassword: true,
        };
      }
      if (items === undefined) {
        return Promise.resolve({
          kind: 'refused',
          reason: 'Cannot open the file as archive',
          noArchive: true,
        });
      }
      if (typeof items === 'string') {
        return Promise.resolve({ kind: 'refused', reason: items });
      }
      const archive = archivesOf.get(items) ?? {
        file: opening,
        version: String(openedArchives.size),
        source: opening,
        tree: new ArchiveTree(items, 'linux'),
      };
      archivesOf.set(items, archive);
      openedArchives.set(opening, archive);
      return Promise.resolve({ kind: 'opened', archive });
    },
    openInside: async (inside, outer, _path, signal) => {
      const inner = await archives.open(inside, signal);
      if (inner.kind !== 'opened') {
        return inner;
      }
      const nested = {
        ...inner.archive,
        outer: { file: outer.file, version: outer.version },
      };
      openedArchives.set(inside, nested);
      return { kind: 'opened', archive: nested };
    },
    within: (inside) => {
      for (const [archiveFile, archive] of openedArchives
        .entries()
        .toArray()
        .toSorted(([one], [other]) => other.length - one.length)) {
        if (
          inside === archiveFile ||
          inside.startsWith(`${archiveFile}${path.sep}`)
        ) {
          return {
            archive,
            inner: path
              .relative(archiveFile, inside)
              .split(path.sep)
              .filter((part) => part !== ''),
          };
        }
      }
      return undefined;
    },
    fileHolding: (inside) =>
      Promise.resolve(
        [...archived.keys()].find(
          (archiveFile) =>
            inside === archiveFile ||
            inside.startsWith(`${archiveFile}${path.sep}`),
        ),
      ),
  };
  const places = new Map<string, { place: PdfPlace; file: string }>();
  const tool = new CommanderTool({
    pdfPlaces: {
      of: (fingerprint) => Promise.resolve(places.get(fingerprint)?.place),
      save: (fingerprint, place, viewed) => {
        places.set(fingerprint, { place, file: viewed });
        return Promise.resolve();
      },
    },
    fileSystem: () => Promise.resolve(fileSystem),
    settings: () => settings,
    defaultColumns: () => defaultColumns,
    saveShowHidden: (shown) => {
      saved.push(shown);
      settings.showHidden = shown;
      return Promise.resolve();
    },
    fileIcon: (iconOf) => {
      iconsLoaded.push(iconOf);
      return Promise.resolve(new TextEncoder().encode(`icon of ${iconOf}`));
    },
    platform: 'linux',
    codePage: () => Promise.resolve('windows-1250'),
    elevate,
    shellMenu: (files, point, extended) => {
      menus.push({ files, at: point, extended });
      return Promise.resolve();
    },
    trash: async (trashing) => {
      trashed.push(trashing);
      await deletesHeld.until;
      if (trashing.endsWith('locked.txt')) {
        throw new Error('It is in use');
      }
    },
    binOff: (listing) => Promise.resolve(binsOff.has(listing)),
    remove: (removing) => {
      removed.push(removing);
      return removing.endsWith('locked.txt')
        ? Promise.reject(new Error('It is in use'))
        : Promise.resolve();
    },
    openFile: (opening) => {
      opened.push(opening);
      return Promise.resolve(
        opening.endsWith('unknown.xyz') ? 'No app is associated with it' : '',
      );
    },
    realPath: (link) =>
      link === at('Documents and Settings')
        ? Promise.resolve(at('Users'))
        : Promise.resolve(link),
    stamp: (stamped) =>
      Promise.resolve(`listed ${listings.get(stamped) ?? 0} times`),
    watch: (watched, changed, stamp) => {
      const watch = { folder: watched, changed, listed: stamp };
      watching.push(watch);
      return () => watching.splice(watching.indexOf(watch), 1);
    },
    watchTree: (watched, changed) => {
      const watch = { folder: watched, changed };
      watchingTrees.push(watch);
      return () => watchingTrees.splice(watchingTrees.indexOf(watch), 1);
    },
    saveSorts: (sorts) => {
      saved.push(sorts);
      settings.sort = sorts;
      return Promise.resolve();
    },
    saveColumns: (columns) => {
      saved.push(columns);
      settings.columns = columns;
      return Promise.resolve();
    },
    saveBookmarks: (bookmarks) => {
      saved.push(bookmarks);
      settings.bookmarks = bookmarks;
      return Promise.resolve();
    },
    store: state,
    thumbnails: {
      read: (key) => Promise.resolve(thumbnails.get(key)),
      has: (key) => Promise.resolve(thumbnails.has(key)),
      full: () => Promise.resolve(thumbnailsFull.now),
      write: (key, made) => {
        if (thumbnailWritesFail.now) {
          return Promise.reject(new Error('ENOSPC: no space left on device'));
        }
        thumbnails.set(key, made);
        return Promise.resolve();
      },
    },
    streamed: (checked) => streamed.has(checked),
    isRepository: async (checked) => {
      repositoriesAsked.push(checked);
      await repositoriesHeld.until;
      return repositories.has(checked);
    },
    inRepository: (checked) => Promise.resolve(insideRepositories.has(checked)),
    initRepository: (folderAsked) => {
      initedIn.push(folderAsked);
      return Promise.resolve();
    },
    cloneInto: (folderAsked) => {
      clonedInto.push(folderAsked);
      return Promise.resolve();
    },
    clipboardFiles: {
      write: (files) => {
        clipboard.files = files;
        return Promise.resolve();
      },
      read: () => Promise.resolve(clipboard.files),
    },
    startDrag: (files) => {
      dragged.push(files);
      return Promise.resolve();
    },
    renameItem: (from, to) => {
      renamed.push([from, to]);
      const refusal =
        path.basename(to) === 'taken.txt'
          ? 'EEXIST'
          : path.basename(from) === 'locked.txt'
            ? 'EBUSY'
            : undefined;
      return refusal === undefined
        ? Promise.resolve()
        : Promise.reject(
            Object.assign(new Error(`${refusal}: refused`), { code: refusal }),
          );
    },
    makeFolder: (making) => {
      madeFolders.push(making);
      return path.basename(making) === 'taken'
        ? Promise.reject(
            Object.assign(new Error('EEXIST: file already exists'), {
              code: 'EEXIST',
            }),
          )
        : Promise.resolve();
    },
    connectTransfer: (listener) => {
      const started = {
        commands: [] as TransferCommand[],
        listener,
        disposed: false,
      };
      transfers.push(started);
      return {
        send: (command) => started.commands.push(command),
        dispose: () => {
          started.disposed = true;
        },
      };
    },
    archives,
    closesBrackets: () => closing.now,
    get viewedCopies() {
      return copies.folder === ''
        ? undefined
        : path.join(copies.folder, 'viewed');
    },
    get sizeWalker() {
      return counting.walker;
    },
    root,
    home: at('work'),
    variable: (name) => (name === 'WORK' ? at('work') : undefined),
    contentReader: {
      hash: (read, bytes) => {
        contentReads.push(read);
        const content = contents[read];
        return Promise.resolve(
          content === undefined
            ? undefined
            : {
                hash: bytes === undefined ? content : content.slice(0, bytes),
                id: read,
                size: content.length,
              },
        );
      },
    },
  });
  const page = new CommanderPage();
  const pages: CommanderPage[] = [page];
  let focused: CommanderPage = page;
  const viewed: string[] = [];
  const edited: string[] = [];
  const turned: string[] = [];
  const compared: (Compared & { readonly tool: string })[] = [];
  const tabs: Tab[] = [];
  tool.attach({
    page: () => focused,
    pages: () => pages,
    current: (shownIn) => shownIn,
    tabs: () => tabs,
    active: () => undefined,
    shown: () => [],
    open: () => Promise.resolve(),
    openView: (_page, _tool, viewedFile) => {
      viewed.push(viewedFile);
      return Promise.resolve();
    },
    openEdit: (_page, _tool, editedFile) => {
      edited.push(editedFile);
      return Promise.resolve();
    },
    editViewed: (_page, turnedTab) => {
      turned.push(turnedTab);
      return Promise.resolve();
    },
    openCompare: (_page, toolOpened, files) => {
      compared.push({ ...files, tool: toolOpened });
      return Promise.resolve();
    },
    openFolders: (_page, toolOpened, folders) => {
      openedIn.push({ tool: toolOpened, folders: [...folders] });
      return Promise.resolve();
    },
    setRoot: () => {},
    visited: () => {},
    recentFolders: () => 10,
    postTabs: () => {},
    notice: (_page, notice) => notices.push(notice),
    track: (tracked) => {
      tracking.push(tracked);
      return tracked;
    },
    idle: () => Promise.resolve(),
  });
  const settled = async () => {
    while (tracking.length > 0) {
      await Promise.all(tracking.splice(0));
    }
  };
  const folderShown = (tab: string, side: Side) =>
    page
      .of('listing')
      .findLast((listing) => listing.tab === tab && listing.side === side)
      ?.folder ?? '';
  const named = (message: FromPage): CommanderToHost => {
    switch (message.type) {
      case 'open':
      case 'view':
      case 'shellMenu':
      case 'delete':
      case 'transfer':
      case 'newFolder':
      case 'copyToClipboard':
      case 'paste':
      case 'drag':
      case 'openRepository':
      case 'folderCommand':
      case 'enterArchive':
      case 'countSizes':
      case 'editFile':
      case 'newFile':
        return {
          ...message,
          folder: message.folder ?? folderShown(message.tab, message.side),
        };
      case 'openOnSide':
        return {
          ...message,
          folder: message.folder ?? folderShown(message.tab, message.from),
        };
      default:
        return message;
    }
  };
  const send = (message: FromPage, from: Page = page) =>
    tool.receive(from, named(message));
  const watched = () => watching.map((watch) => watch.folder).toSorted();
  const watchedAsListed = (watchedFolder: string) =>
    watching.find((watch) => watch.folder === watchedFolder)?.listed;
  const change = async (changed: string) => {
    for (const watch of watching.filter((each) => each.folder === changed)) {
      watch.changed();
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  const watchedTrees = () =>
    watchingTrees.map((watch) => watch.folder).toSorted();
  const changeTree = (changed: string, under: string | undefined) => {
    for (const watch of watchingTrees.filter(
      (each) => each.folder === changed,
    )) {
      watch.changed(under);
    }
  };
  return {
    tool,
    page,
    pages,
    focus: (to: CommanderPage) => {
      focused = to;
    },
    send,
    notices,
    saved,
    state,
    watched,
    watchedAsListed,
    change,
    watchedTrees,
    changeTree,
    iconsLoaded,
    viewed,
    edited,
    turned,
    compared,
    tabs,
    menus,
    opened,
    trashed,
    removed,
    thumbnails,
    streamed,
    contents,
    contentReads,
    binsOff,
    thumbnailsFull,
    thumbnailWritesFail,
    closing,
    settings,
    repositories,
    repositoriesAsked,
    repositoriesHeld,
    insideRepositories,
    clonedInto,
    initedIn,
    deletesHeld,
    settled,
    openedIn,
    transfers,
    madeFolders,
    renamed,
    clipboard,
    dragged,
    archived,
    copies,
    opensHeld,
    extractsHeld,
    secrets,
    passwords,
    extracted,
    packed,
    removedFromArchives,
    changedInArchives,
    tested,
    archiveTests,
    counting,
  };
}

export const plansOf = (
  transfers: readonly { readonly commands: readonly TransferCommand[] }[],
): TransferPlan[] =>
  transfers.flatMap(({ commands }) =>
    commands.flatMap((command) =>
      command.type === 'start' ? [command.plan] : [],
    ),
  );

export const tab: Tab = { id: '1', tool: 'commander' };

export const lastFolder = (page: CommanderPage, id: string, side: Side) =>
  page
    .of('listing')
    .findLast((listing) => listing.tab === id && listing.side === side)?.folder;

export const hiddenIn = (listed: string, ...hidden: string[]) =>
  pathParts(listed).map((part) => hidden.includes(part.path));

export const defaultColumns: ColumnWidths = {
  extension: 10,
  size: 15,
  date: 16,
};

export const defaultSorts: Sorts = {
  left: { column: 'extension', descending: false, groupByColor: false },
  right: { column: 'extension', descending: false, groupByColor: false },
};

export const forged = (json: string): CommanderToHost => JSON.parse(json);

export const archiveItem = (itemPath: string): ArchiveItem => ({
  path: itemPath,
  folder: false,
  size: 1,
  modified: 0,
  hiddenAttribute: false,
  link: false,
  encrypted: false,
});

export const zipped = [
  archiveItem('docs/readme.md'),
  archiveItem('docs/deep/notes.md'),
  archiveItem('top.txt'),
];

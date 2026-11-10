import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import type { Notice, Page, Tab } from '../../../../shell/main/shell';
import type { Compared, Store } from '../../../../shell/main/storage';
import type { ToWebview } from '../../../../shell/shared/protocol';
import type { LocalFileSystem } from '../../../../tools/commander/main/fileSystem';
import {
  childToward,
  CommanderTool,
  rootFolder,
} from '../../../../tools/commander/main/tool';
import type {
  CommanderToHost,
  CommanderToWebview,
  Entry,
  Side,
} from '../../../../tools/commander/shared/protocol';
import type {
  ColumnWidths,
  Sorts,
} from '../../../../tools/commander/shared/settings';
import {
  iconUrl,
  thumbnailUrl,
  viewerIconUrl,
} from '../../../../tools/commander/shared/icons';
import type { ElevatedFileSystem } from '../../../../tools/commander/main/elevated';
import type {
  SizeWalk,
  SizeWalker,
} from '../../../../tools/commander/main/folderSizes';
import {
  ArchiveTree,
  type ArchiveAccess,
  type ArchiveItem,
  type OpenedArchive,
  type PackPlan,
} from '../../../../tools/commander/main/archives';
import {
  maxBytesAsked,
  maxColoredBytes,
} from '../../../../tools/commander/shared/protocol';
import { plainOf, strings } from '../../../../shared/strings';
import {
  boxedThumbnailUrl,
  filledThumbnailUrl,
  madeThumbnailHeader,
  maxImageSize,
  maxThumbnailBytes,
} from '../../../../shared/images';
import { readBudgetBytes } from '../../../../tools/commander/main/textRows';
import { thumbnailKey } from '../../../../tools/commander/main/thumbnailStore';
import {
  fileVersion,
  viewedFileUrl,
} from '../../../../tools/commander/shared/files';
import { pathParts } from '../../../../tools/commander/shared/paths';
import type { PdfPlace } from '../../../../shared/pdf';
import { removeFolder, tempFolder } from '../../../repositories';
import { waitFor } from '../../../fixtures';
import { FakeStore } from '../../../fakeStore';
import type { TransferCommand } from '../../../../tools/commander/main/transferProtocol';
import type { TransferListener } from '../../../../tools/commander/main/transfers';
import type { TransferPlan } from '../../../../tools/commander/main/transfer';

class CommanderPage implements Page {
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

const root = path.resolve('/');
const at = (...names: string[]) => path.join(root, ...names);

const folder = (name: string): Entry => ({
  name,
  folder: true,
  link: false,
  hidden: false,
  size: undefined,
  modified: 0,
});

const file = (name: string): Entry => ({
  name,
  folder: false,
  link: false,
  hidden: false,
  size: 1,
  modified: 0,
});

type Listed = readonly Entry[] | Error | Promise<readonly Entry[]>;

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
  | 'openOnSide';

type Unnamed<Message> = Message extends { readonly type: Naming }
  ? Omit<Message, 'folder'> & { readonly folder?: string }
  : Message;

type FromPage = Unnamed<CommanderToHost>;

function commander(
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
  const binsOff = new Set<string>();
  const thumbnailsFull = { now: false };
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
    get viewedCopies() {
      return copies.folder === ''
        ? undefined
        : path.join(copies.folder, 'viewed');
    },
    get sizeWalker() {
      return counting.walker;
    },
    root,
  });
  const page = new CommanderPage();
  const viewed: string[] = [];
  const compared: (Compared & { readonly tool: string })[] = [];
  const tabs: Tab[] = [];
  tool.attach({
    page: () => page,
    tabs: () => tabs,
    active: () => undefined,
    open: () => Promise.resolve(),
    openView: (_page, _tool, viewedFile) => {
      viewed.push(viewedFile);
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
    compared,
    tabs,
    menus,
    opened,
    trashed,
    removed,
    thumbnails,
    streamed,
    binsOff,
    thumbnailsFull,
    thumbnailWritesFail,
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

const plansOf = (
  transfers: readonly { readonly commands: readonly TransferCommand[] }[],
): TransferPlan[] =>
  transfers.flatMap(({ commands }) =>
    commands.flatMap((command) =>
      command.type === 'start' ? [command.plan] : [],
    ),
  );

const tab: Tab = { id: '1', tool: 'commander' };

const lastFolder = (page: CommanderPage, id: string, side: Side) =>
  page
    .of('listing')
    .findLast((listing) => listing.tab === id && listing.side === side)?.folder;

const hiddenIn = (listed: string, ...hidden: string[]) =>
  pathParts(listed).map((part) => hidden.includes(part.path));

const defaultColumns: ColumnWidths = { extension: 10, size: 15, date: 16 };

const defaultSorts: Sorts = {
  left: { column: 'extension', descending: false, groupByColor: false },
  right: { column: 'extension', descending: false, groupByColor: false },
};

const forged = (json: string): CommanderToHost => JSON.parse(json);

suite('Commander tool', () => {
  test('lists the root on both sides of a tab opened without a folder, and the drives', async () => {
    const { tool, page } = commander(
      { [root]: [folder('Users'), file('notes.txt')] },
      ['C:\\', 'D:\\'],
    );

    await tool.show(page, tab);

    assert.deepStrictEqual(page.listings(), [
      `left ${root}: Users notes.txt`,
      `right ${root}: Users notes.txt`,
    ]);
    assert.deepStrictEqual(page.of('drives'), [
      { type: 'drives', drives: ['C:\\', 'D:\\'] },
    ]);
  });

  suite('with a folder', () => {
    let opened: string;

    beforeEach(() => {
      opened = tempFolder('commander');
    });

    afterEach(() => removeFolder(opened));

    test('serves an image a side lists for its thumbnail, and nothing else, nor an image over the size previewed', async () => {
      const png = Buffer.from('not decoded here');
      fs.writeFileSync(path.join(opened, 'dot.png'), png);
      fs.writeFileSync(path.join(opened, 'notes.txt'), 'notes');
      fs.writeFileSync(path.join(opened, 'huge.png'), png);
      fs.mkdirSync(path.join(opened, 'pics.png'));
      const { tool, page } = commander({
        [root]: [],
        [opened]: [
          file('dot.png'),
          file('notes.txt'),
          folder('pics.png'),
          { ...file('huge.png'), size: maxImageSize + 1 },
        ],
      });
      await tool.show(page, { ...tab, root: opened });
      const thumbnail = async (query: Record<string, string>) => {
        const response = await tool.thumbnail(
          new URL(
            `fastforward://app${thumbnailUrl({ tab: '1', side: 'right', folder: opened, name: 'dot.png', ...query }, '1:0')}`,
          ),
        );
        return response.ok
          ? [response.headers.get('content-type'), await response.text()]
          : response.status;
      };

      assert.deepStrictEqual(await thumbnail({}), [
        'image/png',
        'not decoded here',
      ]);
      assert.strictEqual(await thumbnail({ name: 'notes.txt' }), 404);
      assert.strictEqual(await thumbnail({ name: 'pics.png' }), 404);
      assert.strictEqual(await thumbnail({ name: 'secret.png' }), 404);
      assert.strictEqual(await thumbnail({ name: 'huge.png' }), 413);
      assert.strictEqual(await thumbnail({ folder: root }), 404);
      assert.strictEqual(await thumbnail({ side: 'left' }), 404);
      assert.strictEqual(await thumbnail({ tab: '2' }), 404);
    });

    test('goes on quietly when a thumbnail the page made cannot be kept, as the page shows it already and a full disk told of it for every image', async () => {
      fs.writeFileSync(path.join(opened, 'dot.png'), 'the image');
      const { tool, page, send, thumbnails, thumbnailWritesFail } = commander({
        [root]: [],
        [opened]: [file('dot.png')],
      });
      await tool.show(page, { ...tab, root: opened });
      const save = (box: number) =>
        send({
          type: 'saveThumbnail',
          tab: '1',
          side: 'right',
          folder: opened,
          name: 'dot.png',
          box,
          pixelRatio: 1.5,
          bytes: new Uint8Array(Buffer.from('RIFF\0\0\0\0WEBPVP8 made')),
        });
      await save(144);
      assert.strictEqual(thumbnails.size, 1);
      thumbnailWritesFail.now = true;
      await assert.doesNotReject(save(96));
      assert.strictEqual(thumbnails.size, 1);
    });

    test('keeps the thumbnail the page made of an image a side lists, serving it in place of the image for a box of the same size and pixels, but takes nothing else, as the page is not trusted', async () => {
      fs.writeFileSync(path.join(opened, 'dot.png'), 'the image');
      fs.writeFileSync(path.join(opened, 'notes.txt'), 'notes');
      const { tool, page, send, thumbnails } = commander({
        [root]: [],
        [opened]: [file('dot.png'), file('notes.txt')],
      });
      await tool.show(page, { ...tab, root: opened });
      const webp = new Uint8Array(Buffer.from('RIFF    WEBPVP8 made'));
      const save = (changed: Record<string, unknown> = {}) =>
        send(
          Object.assign(
            {
              type: 'saveThumbnail',
              tab: '1',
              side: 'right',
              folder: opened,
              name: 'dot.png',
              box: 144,
              pixelRatio: 1.5,
              bytes: webp,
            } as const,
            changed,
          ),
        );

      await save();
      await save({ bytes: new Uint8Array(Buffer.from('<svg></svg>')) });
      await save({
        bytes: new Uint8Array(maxThumbnailBytes + 1)
          .fill(0)
          .map((_, index) => webp[index] ?? 0),
        box: 96,
      });
      await save({ name: 'notes.txt' });
      await save({ name: 'secret.png' });
      await save({ folder: root });
      await save({ box: 4000 });
      await save({ pixelRatio: 0 });
      await save({ bytes: [...webp] });

      assert.deepStrictEqual(
        [...thumbnails.keys()],
        [thumbnailKey(path.join(opened, 'dot.png'), 1, 0, 144, 1.5)],
      );
      const served = async (box: number) => {
        const response = await tool.thumbnail(
          new URL(
            `fastforward://app${boxedThumbnailUrl(thumbnailUrl({ tab: '1', side: 'right', folder: opened, name: 'dot.png' }, '1:0'), box, 1.5)}`,
          ),
        );
        return [
          response.headers.get('content-type'),
          response.headers.get(madeThumbnailHeader),
          await response.text(),
        ];
      };
      assert.deepStrictEqual(await served(144), [
        'image/webp',
        '1',
        Buffer.from(webp).toString(),
      ]);
      assert.deepStrictEqual(await served(96), [
        'image/png',
        null,
        'the image',
      ]);
    });

    test('tells a page filling a folder in the background what to make, sparing the images it keeps, those whose data is only online, which reading would download, and every image once its thumbnails are full, yet serves any image to a tile in view', async () => {
      for (const name of ['kept.png', 'online.png', 'drive.png', 'new.png']) {
        fs.writeFileSync(path.join(opened, name), name);
      }
      const { tool, page, thumbnails, streamed, thumbnailsFull } = commander({
        [root]: [],
        [opened]: [
          file('kept.png'),
          { ...file('online.png'), online: true },
          file('drive.png'),
          file('new.png'),
        ],
      });
      await tool.show(page, { ...tab, root: opened });
      thumbnails.set(
        thumbnailKey(path.join(opened, 'kept.png'), 1, 0, 144, 1.5),
        new Uint8Array(1),
      );
      streamed.add(path.join(opened, 'drive.png'));
      const asked = async (name: string, filling: boolean) => {
        const url = boxedThumbnailUrl(
          thumbnailUrl(
            { tab: '1', side: 'right', folder: opened, name },
            '1:0',
          ),
          144,
          1.5,
        );
        const response = await tool.thumbnail(
          new URL(
            `fastforward://app${filling ? filledThumbnailUrl(url) : url}`,
          ),
        );
        await response.body?.cancel();
        return response.status;
      };

      assert.strictEqual(await asked('kept.png', true), 204);
      assert.strictEqual(await asked('online.png', true), 409);
      assert.strictEqual(await asked('drive.png', true), 409);
      assert.strictEqual(await asked('new.png', true), 200);
      assert.strictEqual(await asked('online.png', false), 200);
      assert.strictEqual(await asked('drive.png', false), 200);
      thumbnailsFull.now = true;
      assert.strictEqual(await asked('new.png', true), 507);
      assert.strictEqual(await asked('new.png', false), 200);
    });

    test('moves a side whose folder is gone up to the nearest folder still there, without a word', async () => {
      const gone = path.join(opened, 'gone', 'deeper');
      fs.mkdirSync(gone, { recursive: true });
      const listed: Record<string, Listed> = {
        [root]: [],
        [opened]: [file('kept.txt')],
        [path.join(opened, 'gone')]: [folder('deeper')],
        [gone]: [file('a.txt')],
      };
      const { tool, page, send, notices, watched, change } = commander(listed);
      await tool.show(page, { ...tab, root: path.join(opened, 'gone') });
      await send({ type: 'open', tab: '1', side: 'right', name: 'deeper' });

      fs.rmSync(path.join(opened, 'gone'), { recursive: true });
      delete listed[gone];
      delete listed[path.join(opened, 'gone')];
      await change(gone);
      await waitFor(
        () => page.listings().at(-1)?.startsWith(`right ${opened} `) === true,
        'the side to move up',
      );

      assert.deepStrictEqual(
        page.listings().at(-1),
        `right ${opened} ↑: kept.txt [gone]`,
      );
      assert.deepStrictEqual(notices, []);
      assert.deepStrictEqual(watched(), [opened, root].toSorted());
    });

    test('moves a side whose folder went while its tab was hidden up to the nearest folder still there once shown again, without a word, as it said it could not open the folder and kept listing its files', async () => {
      const gone = path.join(opened, 'gone');
      fs.mkdirSync(gone, { recursive: true });
      const listed: Record<string, Listed> = {
        [root]: [],
        [opened]: [file('kept.txt')],
        [gone]: [file('a.txt')],
      };
      const { tool, page, notices, watched } = commander(listed);
      const shown = { ...tab, root: gone };
      await tool.show(page, shown);
      tool.hide(page);

      fs.rmSync(gone, { recursive: true });
      delete listed[gone];
      await tool.show(page, shown);

      assert.deepStrictEqual(
        page.listings().at(-1),
        `right ${opened} ↑: kept.txt [gone]`,
      );
      assert.deepStrictEqual(notices, []);
      assert.deepStrictEqual(watched(), [opened, root].toSorted());
    });

    test('tells which folders of the path a side lists are hidden, each as its own row would be', async () => {
      const cache = path.join(opened, '.cache');
      const deep = path.join(cache, 'deep');
      fs.mkdirSync(deep, { recursive: true });
      const { tool, page, send } = commander({
        [root]: [],
        [opened]: [folder('.cache')],
        [cache]: [folder('deep')],
        [deep]: [file('notes.txt')],
      });
      await tool.show(page, { ...tab, root: deep });
      await send({ type: 'open', tab: '1', side: 'right', name: '..' });
      await send({ type: 'open', tab: '1', side: 'right', name: '..' });
      assert.deepStrictEqual(
        page
          .of('listing')
          .map((listing) => [listing.side, listing.folder, listing.hidden]),
        [
          ['left', root, hiddenIn(root)],
          ['right', deep, hiddenIn(deep, cache)],
          ['right', cache, hiddenIn(cache, cache)],
          ['right', opened, hiddenIn(opened)],
        ],
      );
      assert.ok(hiddenIn(deep, cache).at(-2));
    });

    test('tells which parts of the path of a file viewed are hidden', async () => {
      const cache = path.join(opened, '.cache');
      fs.mkdirSync(cache);
      const notes = path.join(cache, '.notes.txt');
      fs.writeFileSync(notes, 'one');
      const { tool, page } = commander({});

      await tool.show(page, {
        id: '3',
        tool: 'commander',
        root: notes,
        view: true,
      });

      assert.deepStrictEqual(
        page.of('viewing').map((viewing) => viewing.hidden),
        [
          pathParts(notes).map(
            (part) => part.path === cache || part.path === notes,
          ),
        ],
      );
    });

    test('says it could not open the root once even the root is gone, rather than moving up from it again and again', async () => {
      const { tool, page, notices } = commander({});

      await tool.show(page, { ...tab, root: path.join(opened, 'missing') });

      assert.ok(notices.length > 0);
    });

    test('tells the size of a file viewed and reads its rows around a place, answering each request by its number', async () => {
      const notes = path.join(opened, 'notes.txt');
      fs.writeFileSync(notes, 'one\ntwo\nthree\nfour\n');
      const { tool, page, send } = commander({});
      const viewing: Tab = {
        id: '3',
        tool: 'commander',
        root: notes,
        view: true,
      };
      await tool.show(page, viewing);
      assert.deepStrictEqual(page.of('viewing'), [
        {
          type: 'viewing',
          tab: '3',
          size: 19,
          version: fileVersion(fs.statSync(notes)),
          binary: false,
          hidden: pathParts(notes).map(() => false),
        },
      ]);

      await send({
        type: 'readRows',
        tab: '3',
        encoding: 'utf-8',
        request: 7,
        anchor: 9,
        exact: false,
        before: 1,
        after: 2,
        least: 0,
      });
      const answer = page.of('rows').at(-1);
      assert.deepStrictEqual(
        answer && [
          answer.request,
          answer.anchorIndex,
          answer.rows.map((row) => row.text),
        ],
        [7, 1, ['two', 'three', 'four']],
      );

      for (const bad of [
        { tab: '4' },
        { anchor: -1 },
        { before: 100_000 },
        { after: 1.5 },
        { least: -1 },
        { least: 0.5 },
      ]) {
        await send({
          type: 'readRows',
          tab: '3',
          encoding: 'utf-8',
          request: 8,
          anchor: 0,
          exact: true,
          before: 0,
          after: 1,
          least: 0,
          ...bad,
        });
      }
      await send(
        forged(
          '{ "type": "readRows", "tab": "3", "encoding": "ebcdic", "request": 8, "anchor": 0, "exact": true, "before": 0, "after": 1, "least": 0 }',
        ),
      );
      await send(
        forged(
          '{ "type": "readRows", "tab": "3", "encoding": "utf-8", "request": 8, "anchor": 0, "exact": true, "before": 0, "after": 1 }',
        ),
      );
      assert.strictEqual(page.of('rows').length, 1);
    });

    test('reads rows of a file viewed only until they hold half a megabyte each way once it has the rows the page asks for at least, as long lines kept whole could make a screen of rows megabytes', async () => {
      const longLines = path.join(opened, 'long lines.txt');
      const line = 'x'.repeat(60_000);
      fs.writeFileSync(longLines, `${line}\n`.repeat(30));
      const { tool, page, send } = commander({});
      await tool.show(page, {
        id: '3',
        tool: 'commander',
        root: longLines,
        view: true,
      });

      for (const least of [2, 12]) {
        await send({
          type: 'readRows',
          tab: '3',
          encoding: 'utf-8',
          request: least,
          anchor: 0,
          exact: true,
          before: 0,
          after: 30,
          least,
        });
        assert.strictEqual(
          page.of('rows').at(-1)?.rows.length,
          Math.max(least, Math.ceil(readBudgetBytes / (line.length + 1))),
          String(least),
        );
      }
    });

    test('finds text in a file viewed in the encoding asked for, answering with the bytes of each match, and checks what the page asks', async () => {
      const notes = path.join(opened, 'find.txt');
      fs.writeFileSync(notes, 'Árvíz\nnothing\nÁRVÍZ\n');
      const { tool, page, send } = commander({});
      await tool.show(page, {
        id: '3',
        tool: 'commander',
        root: notes,
        view: true,
      });

      await send({
        type: 'findText',
        tab: '3',
        encoding: 'utf-8',
        query: 'árvíz',
        request: 4,
      });

      assert.deepStrictEqual(page.of('found').at(-1), {
        type: 'found',
        tab: '3',
        request: 4,
        matches: [
          { start: 0, end: 7 },
          { start: 16, end: 23 },
        ],
        capped: false,
        done: true,
      });
      for (const bad of [
        { tab: '4' },
        { query: 'x'.repeat(1001) },
        { request: 1.5 },
      ]) {
        await send({
          type: 'findText',
          tab: '3',
          encoding: 'utf-8',
          query: 'a',
          request: 5,
          ...bad,
        });
      }
      await send(
        forged(
          '{ "type": "findText", "tab": "3", "encoding": "utf-8", "query": 7, "request": 5 }',
        ),
      );
      assert.strictEqual(page.of('found').length, 1);
    });

    test('stops a find the page no longer wants, telling nothing more of it, and leaves a find of another request going', async () => {
      const notes = path.join(opened, 'stop.txt');
      fs.writeFileSync(notes, 'needle '.repeat(1000));
      const { tool, page, send } = commander({});
      await tool.show(page, {
        id: '3',
        tool: 'commander',
        root: notes,
        view: true,
      });
      const ask = (request: number) =>
        send({
          type: 'findText',
          tab: '3',
          encoding: 'utf-8',
          query: 'needle',
          request,
        });

      const stopped = ask(6);
      await send({ type: 'stopFind', tab: '3', request: 6 });
      await stopped;
      assert.deepStrictEqual(page.of('found'), []);

      const going = ask(7);
      await send({ type: 'stopFind', tab: '3', request: 6 });
      await going;
      assert.strictEqual(page.of('found').at(-1)?.done, true);
    });

    test('says the file viewed could not be read once it is deleted, rather than going on showing what it held', async () => {
      const notes = path.join(opened, 'vanishing.txt');
      fs.writeFileSync(notes, 'here');
      const { tool, page, change } = commander({});
      await tool.show(page, {
        id: '3',
        tool: 'commander',
        root: notes,
        view: true,
      });
      fs.rmSync(notes);
      await change(notes);
      await new Promise((resolve) => setTimeout(resolve, 50));
      const told = page.of('viewing').at(-1);
      assert.strictEqual(told?.size, undefined);
      assert.match(plainOf(told?.error ?? ''), /vanishing\.txt/);
    });

    test('says the file viewed could not be read when a find cannot read it, rather than that nothing was found', async () => {
      const notes = path.join(opened, 'gone.txt');
      fs.writeFileSync(notes, 'needle');
      const { tool, page, send } = commander({});
      await tool.show(page, {
        id: '3',
        tool: 'commander',
        root: notes,
        view: true,
      });
      fs.rmSync(notes);
      await send({
        type: 'findText',
        tab: '3',
        encoding: 'utf-8',
        query: 'needle',
        request: 1,
      });
      assert.deepStrictEqual(page.of('found'), []);
      const told = page.of('viewing').at(-1);
      assert.strictEqual(told?.size, undefined);
      assert.match(plainOf(told?.error ?? ''), /gone\.txt/);
    });

    test('reads the rows and the whole text of a file viewed in the encoding asked for, the whole text with its byte order mark, from which the rows count their bytes, and tells of the encoding the mark names', async () => {
      const wide = path.join(opened, 'wide.txt');
      fs.writeFileSync(
        wide,
        Buffer.concat([
          Buffer.from([0xff, 0xfe]),
          Buffer.from('one\ntwo\n', 'utf16le'),
        ]),
      );
      const { tool, page, send } = commander({});
      await tool.show(page, {
        id: '3',
        tool: 'commander',
        root: wide,
        view: true,
      });
      assert.strictEqual(page.of('viewing').at(-1)?.detected, 'utf-16le');

      await send({
        type: 'readRows',
        tab: '3',
        encoding: 'utf-16le',
        request: 1,
        anchor: 0,
        exact: true,
        before: 0,
        after: 5,
        least: 0,
      });
      assert.deepStrictEqual(
        page
          .of('rows')
          .at(-1)
          ?.rows.map((row) => row.text),
        ['one', 'two'],
      );
      await send({
        type: 'readText',
        tab: '3',
        encoding: 'utf-16le',
        request: 2,
      });
      assert.strictEqual(page.of('text').at(-1)?.text, '﻿one\ntwo\n');
    });

    test('reads a UTF-16 file without a byte order mark as UTF-16 rather than as a binary one', async () => {
      const log = path.join(opened, 'pfro.log');
      fs.writeFileSync(log, Buffer.from('3/17/2026 PFRO Error', 'utf16le'));
      const { tool, page } = commander({});

      await tool.show(page, {
        id: '3',
        tool: 'commander',
        root: log,
        view: true,
      });

      assert.strictEqual(page.of('viewing').at(-1)?.detected, 'utf-16le');
    });

    test('reads a text file that is not UTF-8 in the code page of the system, and one that is as UTF-8', async () => {
      const legacy = path.join(opened, 'legacy.txt');
      const modern = path.join(opened, 'modern.txt');
      fs.writeFileSync(legacy, Buffer.from([0xe1, 0x72, 0x76, 0xed, 0x7a]));
      fs.writeFileSync(modern, 'árvíz');
      const { tool, page } = commander({});

      await tool.show(page, {
        id: '3',
        tool: 'commander',
        root: legacy,
        view: true,
      });
      assert.strictEqual(page.of('viewing').at(-1)?.detected, 'windows-1250');
      await tool.show(page, {
        id: '4',
        tool: 'commander',
        root: modern,
        view: true,
      });
      assert.strictEqual(page.of('viewing').at(-1)?.detected, undefined);
    });

    test('tells whether a file viewed is binary and sends the bytes asked for, answering each request by its number', async () => {
      const data = path.join(opened, 'data.bin');
      fs.writeFileSync(data, Buffer.from([1, 0, 2, 3, 4, 5]));
      const { tool, page, send } = commander({});
      await tool.show(page, {
        id: '3',
        tool: 'commander',
        root: data,
        view: true,
      });
      assert.strictEqual(page.of('viewing').at(-1)?.binary, true);

      await send({
        type: 'readBytes',
        tab: '3',
        request: 9,
        start: 2,
        length: 16,
      });
      assert.deepStrictEqual(page.of('bytes'), [
        { type: 'bytes', tab: '3', request: 9, start: 2, data: [2, 3, 4, 5] },
      ]);

      for (const bad of [
        { tab: '4' },
        { start: -1 },
        { start: 0.5 },
        { length: maxBytesAsked + 1 },
      ]) {
        await send({
          type: 'readBytes',
          tab: '3',
          request: 10,
          start: 0,
          length: 16,
          ...bad,
        });
      }
      assert.strictEqual(page.of('bytes').length, 1);
    });

    test('serves the images of a viewing tab, the file viewed and those a document shows, refusing other files, other tabs, relative paths and images too large', async () => {
      const { tool, tabs } = commander({});
      const picture = path.join(opened, 'picture.png');
      fs.writeFileSync(picture, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
      fs.writeFileSync(path.join(opened, 'notes.txt'), 'not an image');
      const large = path.join(opened, 'large.png');
      const handle = fs.openSync(large, 'w');
      fs.ftruncateSync(handle, maxImageSize + 1);
      fs.closeSync(handle);
      tabs.push(
        {
          id: '3',
          tool: 'commander',
          root: path.join(opened, 'readme.md'),
          view: true,
        },
        { id: '4', tool: 'commander', root },
      );
      const served = (viewer: string, image: string) =>
        tool.file(
          new URL(`fastforward://app${viewedFileUrl(viewer, image)}`),
          null,
        );

      const image = await served('3', picture);
      assert.strictEqual(image.status, 200);
      assert.strictEqual(image.headers.get('content-type'), 'image/png');
      assert.deepStrictEqual(
        [...new Uint8Array(await image.arrayBuffer())],
        [0x89, 0x50, 0x4e, 0x47],
      );
      assert.strictEqual(
        (await served('3', path.join(opened, 'notes.txt'))).status,
        404,
      );
      assert.strictEqual((await served('4', picture)).status, 404);
      assert.strictEqual((await served('3', 'picture.png')).status, 404);
      assert.strictEqual(
        (await served('3', path.join(opened, 'missing.png'))).status,
        404,
      );
      assert.strictEqual((await served('3', large)).status, 413);
    });

    test('watches a file viewed once when its tab is shown again while it was still starting to view it, as the first watcher was left open until quitting', async () => {
      const twice = path.join(opened, 'twice.txt');
      fs.writeFileSync(twice, 'text');
      const { tool, page, watched } = commander({});
      const viewer = {
        id: '3',
        tool: 'commander',
        root: twice,
        view: true,
      } as const;

      await Promise.all([tool.show(page, viewer), tool.show(page, viewer)]);

      assert.deepStrictEqual(watched(), [twice]);
      tool.hide(page);
      assert.deepStrictEqual(watched(), []);
    });

    test('says nothing of a file that could not be read once another tab is shown, as the page took it for the tab shown and left it blank', async () => {
      const shown = path.join(opened, 'shown.txt');
      fs.writeFileSync(shown, 'text');
      const { tool, page } = commander({});

      await Promise.all([
        tool.show(page, {
          id: '3',
          tool: 'commander',
          root: path.join(opened, 'gone.txt'),
          view: true,
        }),
        tool.show(page, {
          id: '4',
          tool: 'commander',
          root: shown,
          view: true,
        }),
      ]);

      assert.deepStrictEqual(
        page.of('viewing').map((message) => message.tab),
        ['4'],
      );
    });

    test.skipIf(process.platform !== 'win32')(
      'refuses the images of a drive or share other than that of the file viewed, as a document on a share could name an image on a host of its own and have Windows sign in to it',
      async () => {
        const { tool, tabs } = commander({});
        const picture = path.join(opened, 'picture.png');
        fs.writeFileSync(picture, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
        tabs.push({
          id: '3',
          tool: 'commander',
          root: '\\\\fileserver\\team\\readme.md',
          view: true,
        });

        const served = await tool.file(
          new URL(`fastforward://app${viewedFileUrl('3', picture)}`),
          null,
        );

        assert.strictEqual(served.status, 404);
      },
    );

    test('serves a PDF only to the tab viewing it, by the ranges of bytes asked for, whatever its size', async () => {
      const { tool, tabs } = commander({});
      const book = path.join(opened, 'book.pdf');
      const other = path.join(opened, 'other.pdf');
      fs.writeFileSync(book, '%PDF-1.7 book');
      fs.writeFileSync(other, '%PDF-1.7 other');
      tabs.push({ id: '3', tool: 'commander', root: book, view: true });
      const served = (pdf: string, range?: string) =>
        tool.file(
          new URL(`fastforward://app${viewedFileUrl('3', pdf)}`),
          range ?? null,
        );

      const whole = await served(book);
      assert.strictEqual(whole.status, 200);
      assert.strictEqual(whole.headers.get('content-type'), 'application/pdf');
      assert.strictEqual(whole.headers.get('accept-ranges'), 'bytes');
      assert.strictEqual(await whole.text(), '%PDF-1.7 book');
      const part = await served(book, 'bytes=0-3');
      assert.strictEqual(part.status, 206);
      assert.strictEqual(await part.text(), '%PDF');
      assert.strictEqual((await served(other)).status, 404);
    });

    test('remembers the place in a PDF viewed by its ID, and tells it again once asked, checking what the page sends', async () => {
      const book = path.join(opened, 'book.pdf');
      fs.writeFileSync(book, '%PDF-1.7');
      const { tool, page, send } = commander({});
      await tool.show(page, {
        id: '3',
        tool: 'commander',
        root: book,
        view: true,
      });
      const place = {
        page: 12,
        zoom: 'page-width',
        left: 0,
        top: 400,
      } as const;

      await send({
        type: 'savePdfPlace',
        tab: '3',
        fingerprint: 'ab12',
        place,
      });
      await send({
        type: 'readPdfPlace',
        tab: '3',
        fingerprint: 'ab12',
        request: 4,
      });
      await send({
        type: 'readPdfPlace',
        tab: '3',
        fingerprint: 'cd34',
        request: 5,
      });

      assert.deepStrictEqual(page.of('pdfPlace'), [
        { type: 'pdfPlace', tab: '3', request: 4, place },
        { type: 'pdfPlace', tab: '3', request: 5 },
      ]);
      for (const bad of [
        { tab: '4' },
        { fingerprint: '../places' },
        { place: { ...place, page: 0 } },
      ]) {
        await send({
          type: 'savePdfPlace',
          tab: '3',
          fingerprint: 'ab12',
          place: { ...place, page: 99 },
          ...bad,
        });
      }
      await send(
        forged(
          '{ "type": "savePdfPlace", "tab": "3", "fingerprint": "ab12", "place": "page=99" }',
        ),
      );
      await send({
        type: 'readPdfPlace',
        tab: '3',
        fingerprint: 'ab12',
        request: 6,
      });
      assert.deepStrictEqual(page.of('pdfPlace').at(-1), {
        type: 'pdfPlace',
        tab: '3',
        request: 6,
        place,
      });
    });

    test('remembers the last place in a PDF the page sends as its viewer closes, for the file that tab viewed', async () => {
      const book = path.join(opened, 'book.pdf');
      fs.writeFileSync(book, '%PDF-1.7');
      const { tool, page, send } = commander({});
      const viewer: Tab = {
        id: '3',
        tool: 'commander',
        root: book,
        view: true,
      };
      await tool.show(page, viewer);
      const place = { page: 40, zoom: 'auto', left: 0, top: 0 } as const;

      tool.closed(page, viewer);
      await send({
        type: 'savePdfPlace',
        tab: '3',
        fingerprint: 'ab12',
        place,
      });
      await send({
        type: 'savePdfPlace',
        tab: '9',
        fingerprint: 'ab12',
        place: { ...place, page: 2 },
      });
      await tool.show(page, { ...viewer, id: '4' });
      await send({
        type: 'readPdfPlace',
        tab: '4',
        fingerprint: 'ab12',
        request: 5,
      });

      assert.deepStrictEqual(page.of('pdfPlace').at(-1), {
        type: 'pdfPlace',
        tab: '4',
        request: 5,
        place,
      });
    });

    test('remembers no place for a file viewed that is not a PDF', async () => {
      const notes = path.join(opened, 'notes.txt');
      fs.writeFileSync(notes, 'text');
      const { tool, page, send } = commander({});
      await tool.show(page, {
        id: '3',
        tool: 'commander',
        root: notes,
        view: true,
      });

      await send({
        type: 'savePdfPlace',
        tab: '3',
        fingerprint: 'ab12',
        place: { page: 2, zoom: 'auto', left: 0, top: 0 },
      });
      await send({
        type: 'readPdfPlace',
        tab: '3',
        fingerprint: 'ab12',
        request: 4,
      });

      assert.deepStrictEqual(page.of('pdfPlace'), []);
    });

    test('sends the whole text of a file viewed for its colors, only up to the size colored', async () => {
      const small = path.join(opened, 'small.ts');
      const large = path.join(opened, 'large.ts');
      fs.writeFileSync(small, 'const one = 1;');
      fs.writeFileSync(large, 'x'.repeat(maxColoredBytes + 1));
      const { tool, page, send } = commander({});

      await tool.show(page, {
        id: '3',
        tool: 'commander',
        root: small,
        view: true,
      });
      await send({ type: 'readText', tab: '3', encoding: 'utf-8', request: 4 });
      await send({ type: 'readText', tab: '5', encoding: 'utf-8', request: 5 });
      assert.deepStrictEqual(page.of('text'), [
        { type: 'text', tab: '3', request: 4, text: 'const one = 1;' },
      ]);

      await tool.show(page, {
        id: '6',
        tool: 'commander',
        root: large,
        view: true,
      });
      await send({ type: 'readText', tab: '6', encoding: 'utf-8', request: 6 });
      assert.deepStrictEqual(page.of('text').at(-1), {
        type: 'text',
        tab: '6',
        request: 6,
        text: undefined,
      });
    });

    test('tells the page when the file viewed changes, with its new size, and that one gone can’t be read', async () => {
      const grown = path.join(opened, 'grows.log');
      fs.writeFileSync(grown, 'a\n');
      const { tool, page, change } = commander({});
      await tool.show(page, {
        id: '3',
        tool: 'commander',
        root: grown,
        view: true,
      });

      fs.appendFileSync(grown, 'b\n');
      await change(grown);
      await waitFor(
        () => page.of('viewing').at(-1)?.size === 4,
        'the new size to be told',
      );

      const gone = path.join(opened, 'gone.txt');
      await tool.show(page, {
        id: '4',
        tool: 'commander',
        root: gone,
        view: true,
      });
      const told = page.of('viewing').at(-1);
      assert.deepStrictEqual(told && [told.tab, told.size], ['4', undefined]);
      assert.ok(told?.error);
    });

    test('tells the page a new version of the file viewed when it changes though its size does not, as an image or PDF of the same size kept showing the one before', async () => {
      const picture = path.join(opened, 'same.png');
      fs.writeFileSync(picture, 'one\n');
      const { tool, page, change } = commander({});
      await tool.show(page, {
        id: '3',
        tool: 'commander',
        root: picture,
        view: true,
      });

      fs.writeFileSync(picture, 'two\n');
      const later = new Date(Date.now() + 10_000);
      fs.utimesSync(picture, later, later);
      await change(picture);
      await waitFor(
        () => page.of('viewing').length === 2,
        'the change to be told',
      );

      const [first, second] = page.of('viewing');
      assert.strictEqual(second?.size, first?.size);
      assert.notStrictEqual(second?.version, first?.version);
      assert.strictEqual(second?.version, fileVersion(fs.statSync(picture)));
    });

    test('lists the folder the tab was opened with on the right, and the root on the left', async () => {
      const { tool, page } = commander({
        [root]: [folder('Users')],
        [opened]: [file('opened.txt')],
      });

      await tool.show(page, { ...tab, root: opened });

      assert.deepStrictEqual(page.listings(), [
        `left ${root}: Users`,
        `right ${opened} ↑: opened.txt`,
      ]);
      assert.strictEqual(tool.folderOf({ ...tab, root: opened }), opened);
    });
  });

  test('opens a file in the app the system opens it with, a program by running it, staying in its folder, and says why one could not be opened', async () => {
    const { tool, page, send, notices, opened } = commander({
      [root]: [file('notes.txt'), file('setup.exe'), file('unknown.xyz')],
    });
    await tool.show(page, tab);
    for (const name of ['notes.txt', 'setup.exe', 'unknown.xyz', 'gone.txt']) {
      await send({ type: 'open', tab: '1', side: 'right', name });
    }
    assert.deepStrictEqual(opened, [
      at('notes.txt'),
      at('setup.exe'),
      at('unknown.xyz'),
    ]);
    assert.deepStrictEqual(notices, [
      {
        level: 'error',
        message: strings.commander.openFailed(
          'unknown.xyz',
          'No app is associated with it',
        ),
      },
    ]);
    assert.strictEqual(tool.folderOf(tab), root);
  });

  test('moves the items asked for to the Recycle Bin, or deletes them for good, only when every one is listed in the folder and never its parent, saying which could not be deleted and why', async () => {
    const { tool, page, send, notices, trashed, removed } = commander({
      [root]: [
        file('a.txt'),
        folder('dir'),
        file('b.txt'),
        file('locked.txt'),
        file('c.txt'),
      ],
    });
    await tool.show(page, tab);
    const remove = (names: string[], permanently: boolean) =>
      send({ type: 'delete', tab: '1', side: 'right', names, permanently });
    await remove(['a.txt', 'dir'], false);
    await remove(['b.txt'], true);
    await remove(['c.txt', '..'], false);
    await remove(['c.txt', 'gone.txt'], true);
    await remove([], false);
    await send(
      forged(
        '{ "type": "delete", "tab": "1", "side": "right", "names": ["c.txt"], "permanently": "yes" }',
      ),
    );
    assert.deepStrictEqual(trashed, [at('a.txt'), at('dir')]);
    assert.deepStrictEqual(removed, [at('b.txt')]);
    assert.deepStrictEqual(notices, []);
    await remove(['locked.txt', 'c.txt'], false);
    assert.deepStrictEqual(trashed.slice(2), [at('locked.txt'), at('c.txt')]);
    assert.deepStrictEqual(notices, [
      {
        level: 'error',
        message: strings.commander.deleteFailed('locked.txt', 'It is in use'),
      },
    ]);
  });

  test('tells the page which folders are on a drive whose Recycle Bin is turned off, asking again as each is listed, so Delete can say it deletes permanently there', async () => {
    const { tool, page, send, binsOff } = commander({
      [root]: [folder('dir')],
      [at('dir')]: [],
    });
    binsOff.add(at('dir'));
    await tool.show(page, tab);
    await send({ type: 'open', tab: '1', side: 'right', name: 'dir' });
    binsOff.delete(at('dir'));
    await send({ type: 'reread', tab: '1', side: 'right' });
    binsOff.add(root);
    await send({ type: 'open', tab: '1', side: 'right', name: '..' });
    assert.deepStrictEqual(
      page
        .of('listing')
        .filter((listing) => listing.side === 'right')
        .map((listing) => [listing.folder, listing.binOff]),
      [
        [root, undefined],
        [at('dir'), true],
        [at('dir'), undefined],
        [root, true],
      ],
    );
  });

  test('deletes the items asked for from the folder they were listed in, also once the side has gone to another folder while they were being deleted, leaving the side where it went', async () => {
    const { tool, page, send, trashed, deletesHeld } = commander({
      [root]: [folder('big'), folder('dist'), folder('next')],
      [at('next')]: [folder('dist')],
    });
    await tool.show(page, tab);
    const slow = Promise.withResolvers<void>();
    deletesHeld.until = slow.promise;
    const deleting = send({
      type: 'delete',
      tab: '1',
      side: 'right',
      names: ['big', 'dist'],
      permanently: false,
    });
    await send({ type: 'open', tab: '1', side: 'right', name: 'next' });
    slow.resolve();
    await deleting;
    assert.deepStrictEqual(trashed, [at('big'), at('dist')]);
    assert.strictEqual(tool.folderOf(tab), at('next'));
  });

  test('copies or moves the items asked for into the folder of the other side, only when every one is listed in the folder named, never its parent, and the other side still shows the folder named as the target', async () => {
    const { tool, page, send, transfers } = commander({
      [root]: [file('a.txt'), folder('dir'), folder('target')],
      [at('target')]: [],
    });
    await tool.show(page, tab);
    await send({ type: 'open', tab: '1', side: 'left', name: 'target' });
    const transfer = (names: string[], move: boolean, target = at('target')) =>
      send({ type: 'transfer', tab: '1', side: 'right', names, target, move });

    await transfer(['a.txt', 'dir'], false);
    await transfer(['a.txt'], true);
    await transfer(['a.txt', '..'], false);
    await transfer(['gone.txt'], false);
    await transfer([], false);
    await transfer(['a.txt'], false, root);
    await send(
      forged(
        JSON.stringify({
          type: 'transfer',
          tab: '1',
          side: 'right',
          folder: root,
          names: ['a.txt'],
          target: at('target'),
          move: 'yes',
        }),
      ),
    );

    assert.deepStrictEqual(plansOf(transfers), [
      { sources: [at('a.txt'), at('dir')], target: at('target'), move: false },
      { sources: [at('a.txt')], target: at('target'), move: true },
    ]);
  });

  test('says the items are in the folder already rather than copying them onto themselves, that a folder cannot go into itself or a folder in it, and that nothing is copied or moved yet in a folder read as administrator', async () => {
    const helper: ElevatedFileSystem = {
      list: () => Promise.resolve([file('secret.txt')]),
      drives: () => Promise.resolve([]),
      watch: () => () => {},
      closed: new Promise(() => {}),
      close: () => {},
    };
    const { tool, page, send, notices, transfers } = commander(
      {
        [root]: [file('a.txt'), folder('dir'), folder('Config.Msi')],
        [at('dir')]: [folder('inner')],
        [at('dir', 'inner')]: [],
        [at('Config.Msi')]: Object.assign(new Error('denied'), {
          code: 'EPERM',
        }),
      },
      [],
      () => Promise.resolve(helper),
    );
    await tool.show(page, tab);
    const transfer = (names: string[], target: string) =>
      send({
        type: 'transfer',
        tab: '1',
        side: 'right',
        names,
        target,
        move: true,
      });

    await transfer(['a.txt'], root);
    await send({ type: 'open', tab: '1', side: 'left', name: 'dir' });
    await send({ type: 'open', tab: '1', side: 'left', name: 'inner' });
    await transfer(['a.txt', 'dir'], at('dir', 'inner'));
    await send({ type: 'open', tab: '1', side: 'left', name: '..' });
    await transfer(['dir'], at('dir'));
    await send({ type: 'open', tab: '1', side: 'left', name: '..' });
    await send({ type: 'open', tab: '1', side: 'left', name: 'Config.Msi' });
    await send({ type: 'elevate', tab: '1', side: 'left' });
    await transfer(['a.txt'], at('Config.Msi'));
    await send({
      type: 'transfer',
      tab: '1',
      side: 'left',
      names: ['secret.txt'],
      target: root,
      move: false,
    });

    assert.deepStrictEqual(plansOf(transfers), []);
    assert.deepStrictEqual(notices, [
      { level: 'error', message: strings.commander.alreadyIn(root) },
      { level: 'error', message: strings.commander.intoItself('dir') },
      { level: 'error', message: strings.commander.intoItself('dir') },
      { level: 'error', message: strings.commander.transferAsAdministrator },
      { level: 'error', message: strings.commander.transferAsAdministrator },
    ]);
  });

  test('has the shell ask before quitting while a copy runs, saying quitting stops it, and no longer once it is done', async () => {
    const { tool, page, send, transfers } = commander({
      [root]: [file('a.txt'), folder('target')],
      [at('target')]: [],
    });
    await tool.show(page, tab);
    assert.strictEqual(tool.quitNote(), undefined);
    await send({ type: 'open', tab: '1', side: 'left', name: 'target' });
    await send({
      type: 'transfer',
      tab: '1',
      side: 'right',
      names: ['a.txt'],
      target: at('target'),
      move: false,
    });
    await send({ type: 'hideTransfer', transfer: 1 });

    assert.strictEqual(tool.quitNote(), strings.commander.quitStopsTransfers);
    transfers[0].listener.event({ type: 'done', stopped: false });
    await waitFor(() => tool.quitNote() === undefined, 'the copy to end');
  });

  test('shows the page the transfer to show and what it asks, sends on what the page answers to it, and lists the side showing its target again once it is done', async () => {
    const { tool, page, send, transfers } = commander({
      [root]: [file('a.txt'), folder('target')],
      [at('target')]: [],
    });
    await tool.show(page, tab);
    await send({ type: 'open', tab: '1', side: 'left', name: 'target' });
    await send({
      type: 'transfer',
      tab: '1',
      side: 'right',
      names: ['a.txt'],
      target: at('target'),
      move: false,
    });
    const shown = () => page.of('transfer').at(-1)?.view;
    assert.deepStrictEqual(shown(), {
      id: 1,
      move: false,
      items: 1,
      name: 'a.txt',
      target: at('target'),
      stopping: false,
    });

    const clash = {
      name: 'a.txt',
      source: { size: 1, modified: 2 },
      target: { size: 3, modified: 4 },
    };
    transfers[0].listener.event({ type: 'clash', clash });
    assert.deepStrictEqual(shown()?.clash, { ...clash, asked: 1 });
    await send({
      type: 'answerClash',
      transfer: 1,
      asked: 1,
      answer: 'overwrite',
      all: false,
    });
    await send({ type: 'hideTransfer', transfer: 1 });
    assert.strictEqual(shown(), undefined);
    tool.ready(page);
    assert.strictEqual(page.of('transfer').at(-1)?.view, undefined);
    await send({ type: 'stopTransfer', transfer: 1 });
    assert.deepStrictEqual(transfers[0].commands.slice(1), [
      { type: 'answer', reply: { answer: 'overwrite', all: false } },
      { type: 'stop' },
    ]);

    const listings = page.listings().length;
    transfers[0].listener.event({ type: 'done', stopped: true });
    await waitFor(
      () => page.listings().length > listings,
      'the target to be listed again',
    );
    assert.deepStrictEqual(page.listings().slice(listings), [
      `left ${at('target')} ↑: `,
    ]);
  });

  test('puts the files asked for on the clipboard, only when every one is listed in the folder named, never its parent', async () => {
    const { tool, page, send, clipboard } = commander({
      [root]: [file('a.txt'), folder('dir')],
    });
    await tool.show(page, tab);
    const copy = (names: string[]) =>
      send({ type: 'copyToClipboard', tab: '1', side: 'right', names });

    await copy(['a.txt', 'gone.txt']);
    await copy(['a.txt', '..']);
    await copy([]);
    assert.deepStrictEqual(clipboard.files, []);
    await copy(['a.txt', 'dir']);
    assert.deepStrictEqual(clipboard.files, [at('a.txt'), at('dir')]);
  });

  test('starts dragging the files asked for out of the app, only when every one is listed in the folder named, never its parent', async () => {
    const { tool, page, send, dragged } = commander({
      [root]: [file('a.txt'), folder('dir')],
    });
    await tool.show(page, tab);
    const drag = (names: string[]) =>
      send({ type: 'drag', tab: '1', side: 'right', names });

    await drag(['a.txt', 'gone.txt']);
    await drag(['..']);
    await drag([]);
    await drag(['dir', 'a.txt']);

    assert.deepStrictEqual(dragged, [[at('dir'), at('a.txt')]]);
  });

  test('copies or moves the files dropped on a side into its folder, the folder they were dropped on or its parent, only while the side shows the folder named and every file is a whole path, refusing them in the folder they are in', async () => {
    const { tool, page, send, transfers, notices } = commander({
      [root]: [file('a.txt'), folder('target')],
      [at('target')]: [folder('inner'), file('b.txt')],
      [at('target', 'inner')]: [],
    });
    await tool.show(page, tab);
    await send({ type: 'open', tab: '1', side: 'right', name: 'target' });
    const elsewhere = path.join(root, 'elsewhere');
    const files = [path.join(elsewhere, 'x.txt'), path.join(elsewhere, 'y')];
    const drop = (message: object, dropped: unknown = files) =>
      tool.dropped(page, dropped, {
        type: 'drop',
        tab: '1',
        side: 'right',
        folder: at('target'),
        move: false,
        ...message,
      });

    await drop({});
    await drop({ into: 'inner', move: true });
    await drop({ into: '..' });
    await drop({ into: 'b.txt' });
    await drop({ into: 'gone' });
    await drop({ folder: root });
    await drop({}, ['relative.txt']);
    await drop({}, []);
    await drop({}, [7]);
    await drop({}, 'x.txt');
    await drop({ move: 'yes' });
    await tool.dropped(page, files, { type: 'other' });
    await drop({}, [at('target', 'b.txt')]);

    assert.deepStrictEqual(plansOf(transfers), [
      { sources: files, target: at('target'), move: false },
      { sources: files, target: at('target', 'inner'), move: true },
      { sources: files, target: root, move: false },
    ]);
    assert.deepStrictEqual(notices, [
      { level: 'error', message: strings.commander.alreadyIn(at('target')) },
    ]);
  });

  test('pastes the files on the clipboard into the folder named as a copy of them, refusing them in the folder they are in or a folder into itself, and saying when the clipboard holds no files', async () => {
    const { tool, page, send, clipboard, transfers, notices } = commander({
      [root]: [file('a.txt'), folder('dir')],
      [at('dir')]: [],
    });
    await tool.show(page, tab);
    const paste = () => send({ type: 'paste', tab: '1', side: 'right' });

    await paste();
    clipboard.files = [at('a.txt')];
    await paste();
    clipboard.files = [at('dir')];
    await send({ type: 'open', tab: '1', side: 'right', name: 'dir' });
    await paste();
    clipboard.files = [at('a.txt'), path.join(root, 'elsewhere', 'b.txt')];
    await paste();

    assert.deepStrictEqual(plansOf(transfers), [
      {
        sources: [at('a.txt'), path.join(root, 'elsewhere', 'b.txt')],
        target: at('dir'),
        move: false,
      },
    ]);
    assert.deepStrictEqual(notices, [
      { level: 'info', message: strings.commander.nothingToPaste },
      { level: 'error', message: strings.commander.alreadyIn(root) },
      { level: 'error', message: strings.commander.intoItself('dir') },
    ]);
  });

  test('makes a folder of the name asked for in the folder named, selecting it once listed, and none of a name reaching another folder or one Windows would refuse there, saying when the name is taken', async () => {
    const { tool, page, send, madeFolders, notices } = commander({
      [root]: [file('a.txt')],
    });
    await tool.show(page, tab);
    const make = (name: string) =>
      send({ type: 'newFolder', tab: '1', side: 'right', name });

    await make('photos');
    assert.strictEqual(page.of('listing').at(-1)?.selected, 'photos');
    await make('..');
    await make(`sub${path.sep}x`);
    await make('a/b');
    await make('');
    await send(
      forged(
        JSON.stringify({
          type: 'newFolder',
          tab: '1',
          side: 'right',
          folder: root,
          name: 7,
        }),
      ),
    );
    await make('taken');

    assert.deepStrictEqual(madeFolders, [at('photos'), at('taken')]);
    assert.deepStrictEqual(notices, [
      { level: 'error', message: strings.commander.nameTaken('taken') },
    ]);
  });

  test('renames a file or folder the side lists to the name asked for, selecting it once listed, and nothing the side does not list nor to a name reaching another folder or one Windows would refuse there, saying when the name is taken or the system refuses', async () => {
    const { tool, page, send, renamed, notices } = commander({
      [root]: [
        file('a.txt'),
        folder('docs'),
        file('locked.txt'),
        file('taken.txt'),
      ],
    });
    await tool.show(page, tab);
    const rename = (name: string, to: string) =>
      send({ type: 'rename', tab: '1', side: 'right', folder: root, name, to });

    await rename('a.txt', 'b.txt');
    assert.strictEqual(page.of('listing').at(-1)?.selected, 'b.txt');
    await rename('docs', 'notes');
    await rename('missing.txt', 'x.txt');
    await rename('a.txt', '..');
    await rename('a.txt', `sub${path.sep}x`);
    await rename('a.txt', 'a/b');
    await rename('a.txt', '');
    await send(
      forged(
        JSON.stringify({
          type: 'rename',
          tab: '1',
          side: 'right',
          folder: root,
          name: 'a.txt',
          to: 7,
        }),
      ),
    );
    await rename('locked.txt', 'free.txt');
    await rename('a.txt', 'taken.txt');

    assert.deepStrictEqual(renamed, [
      [at('a.txt'), at('b.txt')],
      [at('docs'), at('notes')],
      [at('locked.txt'), at('free.txt')],
      [at('a.txt'), at('taken.txt')],
    ]);
    assert.deepStrictEqual(notices, [
      {
        level: 'error',
        message: strings.commander.renameFailed('locked.txt', 'EBUSY: refused'),
      },
      { level: 'error', message: strings.commander.nameTaken('taken.txt') },
    ]);
  });

  test('renames a file listed flat in its own folder, reading that folder again', async () => {
    const { tool, page, send, renamed } = commander({
      [root]: [folder('docs')],
      [at('docs')]: [file('a.txt')],
    });
    await tool.show(page, tab);
    await send({ type: 'flat', tab: '1', side: 'right', flat: true });
    const inDocs = path.join('docs', 'a.txt');
    await waitFor(
      () =>
        page
          .of('flatFiles')
          .some((message) =>
            message.folders.some((listed) =>
              listed.entries.some((entry) => entry.name === 'a.txt'),
            ),
          ),
      'the file in docs to be listed flat',
    );
    const told = page.of('flatFiles').length;
    await send({
      type: 'rename',
      tab: '1',
      side: 'right',
      folder: root,
      name: inDocs,
      to: 'b.txt',
    });
    assert.deepStrictEqual(renamed, [[at(inDocs), at('docs', 'b.txt')]]);
    await waitFor(
      () => page.of('flatFiles').length > told,
      'docs to be read again',
    );
  });

  test('packs the items a side lists into the archive asked for, shown in the dialog of copies as packing, and nothing of items it does not list, nor an archive of a name no folder can hold, into one of the items, nor with a password a zip cannot hold', async () => {
    const { tool, page, send, packed, notices } = commander({
      [root]: [file('a.txt'), folder('docs')],
    });
    await tool.show(page, tab);
    const archive = path.join(root, 'out', 'photos.zip');
    const pack = (extra: Record<string, unknown> = {}) =>
      send(
        forged(
          JSON.stringify({
            type: 'pack',
            tab: '1',
            side: 'right',
            folder: root,
            names: ['a.txt', 'docs'],
            archive,
            format: 'zip',
            level: 'normal',
            ...extra,
          }),
        ),
      );

    await pack({
      format: '7z',
      level: 'ultra',
      password: 'pässwörd',
      encryptNames: true,
      volumeBytes: 1_048_576,
      test: true,
    });
    await waitFor(() => packed.length === 1, 'the pack to start');
    assert.deepStrictEqual(
      page.of('transfer').find((message) => message.view?.archiveJob === 'pack')
        ?.view,
      {
        id: 1,
        move: false,
        archiveJob: 'pack',
        items: 2,
        target: archive,
        stopping: false,
      },
    );
    for (const wrong of [
      { names: ['missing.txt'] },
      { names: [] },
      { archive: 'photos.zip' },
      { archive: `${root}${path.sep}..` },
      { archive: at('docs', 'inside.zip') },
      { format: 'rar' },
      { level: 'best' },
      { password: 'pässwörd' },
      { password: '' },
      { volumeBytes: 1000 },
      { zipCipher: 'rot13' },
      { test: 'yes' },
    ]) {
      await pack(wrong);
    }

    assert.deepStrictEqual(packed, [
      {
        folder: root,
        items: ['a.txt', 'docs'],
        archive,
        format: '7z',
        level: 'ultra',
        password: 'pässwörd',
        encryptNames: true,
        volumeBytes: 1_048_576,
        test: true,
      },
    ]);
    assert.deepStrictEqual(notices, [
      { level: 'error', message: strings.commander.intoItself('docs') },
    ]);
  });

  test('packs over an archive there already, or its first volume, only when the dialog said it replaces it, saying so otherwise', async () => {
    const { tool, page, send, packed, notices } = commander({
      [root]: [file('a.txt')],
    });
    await tool.show(page, tab);
    const there = tempFolder('packed-there');
    try {
      fs.writeFileSync(path.join(there, 'photos.zip'), 'old');
      fs.writeFileSync(path.join(there, 'parts.7z.001'), 'old');
      const pack = (archive: string, extra: Record<string, unknown> = {}) =>
        send({
          type: 'pack',
          tab: '1',
          side: 'right',
          folder: root,
          names: ['a.txt'],
          archive: path.join(there, archive),
          format: archive.endsWith('.7z') ? '7z' : 'zip',
          level: 'normal',
          ...extra,
        });

      await pack('photos.zip');
      await pack('parts.7z', { volumeBytes: 1_048_576 });
      await pack('photos.zip', { replace: true });
      await waitFor(() => packed.length === 1, 'the pack to start');

      assert.deepStrictEqual(
        packed.map((plan) => path.basename(plan.archive)),
        ['photos.zip'],
      );
      assert.deepStrictEqual(notices, [
        {
          level: 'error',
          message: strings.commander.archiveThereKept(
            path.join(there, 'photos.zip'),
          ),
        },
        {
          level: 'error',
          message: strings.commander.archiveThereKept(
            path.join(there, 'parts.7z'),
          ),
        },
      ]);
    } finally {
      removeFolder(there);
    }
  });

  test('tests the archives a side lists one after another in the dialog of copies, asking the password of one encrypted, saying which failed and why or that they passed, and nothing of folders or items not listed', async () => {
    const { tool, page, send, tested, archiveTests, secrets, notices } =
      commander({
        [root]: [file('a.zip'), file('b.7z'), file('c.zip'), folder('dir')],
      });
    archiveTests.set(at('c.zip'), 'CRC Failed : x.txt');
    archiveTests.set(at('b.7z'), 'locked');
    secrets.set(at('b.7z'), 'right');
    await tool.show(page, tab);
    const testing = (names: string[]) =>
      send({
        type: 'testArchives',
        tab: '1',
        side: 'right',
        folder: root,
        names,
      });

    await testing(['missing.zip']);
    await testing(['dir']);
    await testing(['a.zip', 'b.7z', 'c.zip', 'dir']);
    await waitFor(
      () => page.of('askPassword').length === 1,
      'the password of b.7z to be asked',
    );
    await send({
      type: 'password',
      ask: page.of('askPassword')[0]?.ask ?? 0,
      password: 'right',
    });
    await waitFor(() => notices.length === 1, 'the tests to end');
    await testing(['a.zip']);
    await waitFor(() => notices.length === 2, 'the test of a.zip to end');

    assert.deepStrictEqual(tested, [
      at('a.zip'),
      at('b.7z'),
      at('b.7z'),
      at('c.zip'),
      at('a.zip'),
    ]);
    assert.deepStrictEqual(
      page.of('transfer').find((message) => message.view?.archiveJob === 'test')
        ?.view,
      {
        id: 1,
        move: false,
        archiveJob: 'test',
        items: 3,
        target: root,
        stopping: false,
      },
    );
    assert.deepStrictEqual(notices, [
      {
        level: 'error',
        message: strings.commander.testFailed('c.zip', 'CRC Failed : x.txt'),
      },
      {
        level: 'info',
        message: strings.commander.testPassed(
          strings.commander.oneItem('a.zip'),
        ),
      },
    ]);
  });

  test('says no folder is made and nothing renamed yet in a folder read as administrator', async () => {
    const helper: ElevatedFileSystem = {
      list: () => Promise.resolve([file('secret.txt')]),
      drives: () => Promise.resolve([]),
      watch: () => () => {},
      closed: new Promise(() => {}),
      close: () => {},
    };
    const { tool, page, send, madeFolders, renamed, notices } = commander(
      {
        [root]: [folder('Config.Msi')],
        [at('Config.Msi')]: Object.assign(new Error('denied'), {
          code: 'EPERM',
        }),
      },
      [],
      () => Promise.resolve(helper),
    );
    await tool.show(page, tab);
    await send({ type: 'open', tab: '1', side: 'left', name: 'Config.Msi' });
    await send({ type: 'elevate', tab: '1', side: 'left' });

    await send({ type: 'newFolder', tab: '1', side: 'left', name: 'new' });
    await send({
      type: 'rename',
      tab: '1',
      side: 'left',
      folder: at('Config.Msi'),
      name: 'secret.txt',
      to: 'public.txt',
    });

    assert.deepStrictEqual([madeFolders, renamed], [[], []]);
    assert.deepStrictEqual(notices, [
      {
        level: 'error',
        message: strings.commander.makeFolderAsAdministrator,
      },
      { level: 'error', message: strings.commander.renameAsAdministrator },
    ]);
  });

  test('ends every copy and move on quitting', async () => {
    const { tool, page, send, transfers } = commander({
      [root]: [file('a.txt'), folder('target')],
      [at('target')]: [],
    });
    await tool.show(page, tab);
    await send({ type: 'open', tab: '1', side: 'left', name: 'target' });
    await send({
      type: 'transfer',
      tab: '1',
      side: 'right',
      names: ['a.txt'],
      target: at('target'),
      move: false,
    });

    tool.quit();

    assert.deepStrictEqual(
      transfers.map((each) => each.disposed),
      [true],
    );
  });

  test('acts on the files a page names only in the folder it names, which the side must still show, as Delete right after Backspace trashed a file of the same name in the folder the side went to', async () => {
    const {
      tool,
      page,
      send,
      trashed,
      removed,
      opened,
      viewed,
      menus,
      compared,
      openedIn,
      repositories,
      settled,
      transfers,
      madeFolders,
      clipboard,
      dragged,
    } = commander({
      [root]: [folder('sub'), folder('same'), file('same.txt')],
      [at('sub')]: [folder('same'), file('same.txt')],
      [at('same')]: [],
    });
    repositories.add(at('same'));
    await tool.show(page, tab);
    await send({ type: 'open', tab: '1', side: 'right', name: 'sub' });
    await send({ type: 'open', tab: '1', side: 'right', name: '..' });
    await settled();
    const left = at('sub');
    const named = { tab: '1', side: 'right', folder: left } as const;
    const listings = page.listings().length;

    await send({
      type: 'delete',
      ...named,
      names: ['same.txt'],
      permanently: false,
    });
    await send({
      type: 'delete',
      ...named,
      names: ['same.txt'],
      permanently: true,
    });
    await send({ type: 'open', ...named, name: 'same.txt' });
    await send({ type: 'open', ...named, name: 'same' });
    await send({ type: 'open', ...named, name: '..' });
    await send({ type: 'view', ...named, name: 'same.txt' });
    await send({
      type: 'shellMenu',
      ...named,
      names: ['same.txt'],
      x: 1,
      y: 2,
      extended: false,
    });
    await send({
      type: 'openOnSide',
      tab: '1',
      from: 'right',
      side: 'left',
      folder: left,
      name: 'same',
    });
    await send({
      type: 'compare',
      tab: '1',
      files: [
        { side: 'right', folder: left, name: 'same.txt' },
        { side: 'right', folder: root, name: 'same.txt' },
      ],
    });
    await send({ type: 'openRepository', ...named, name: 'same' });
    await send({
      type: 'transfer',
      ...named,
      names: ['same.txt'],
      target: root,
      move: false,
    });
    await send({ type: 'newFolder', ...named, name: 'new' });
    await send({ type: 'copyToClipboard', ...named, names: ['same.txt'] });
    clipboard.files = [at('same.txt')];
    await send({ type: 'paste', ...named });
    await send({ type: 'drag', ...named, names: ['same.txt'] });

    assert.deepStrictEqual(
      {
        madeFolders,
        trashed,
        removed,
        opened,
        viewed,
        menus,
        compared,
        openedIn,
        transfers,
      },
      {
        madeFolders: [],
        trashed: [],
        removed: [],
        opened: [],
        viewed: [],
        menus: [],
        compared: [],
        openedIn: [],
        transfers: [],
      },
    );
    assert.strictEqual(page.listings().length, listings);
    assert.strictEqual(tool.folderOf(tab), root);
    assert.deepStrictEqual(clipboard.files, [at('same.txt')]);
    assert.deepStrictEqual(dragged, []);
  });

  test('holds the widths of the columns and the size of the tiles the settings give in the range they may take, as a width too wide failed every drag after it and a size below the least drew no tiles', async () => {
    const { tool, page, settings } = commander({ [root]: [] });
    settings.columns = { extension: 10.4, size: 0, date: 120 };
    settings.thumbnailSize = -16;
    tool.ready(page);
    const told = page.of('settings').at(-1);
    assert.deepStrictEqual(told?.columns, {
      extension: 10,
      size: 1,
      date: 100,
    });
    assert.strictEqual(told.thumbnailSize, 16);
    settings.thumbnailSize = 5000;
    tool.ready(page);
    assert.strictEqual(page.of('settings').at(-1)?.thumbnailSize, 1024);
  });

  test('gives the folder of the active side as the folder of the tab, the right one until the page makes the left one active', async () => {
    const { tool, page, send } = commander({
      [root]: [folder('Users')],
      [at('Users')]: [],
    });
    await tool.show(page, tab);
    await send({ type: 'open', tab: '1', side: 'left', name: 'Users' });
    assert.strictEqual(tool.folderOf(tab), root);

    await send({ type: 'activate', tab: '1', side: 'left' });
    assert.strictEqual(tool.folderOf(tab), at('Users'));

    await send(forged('{ "type": "activate", "tab": "1", "side": "middle" }'));
    await send({ type: 'activate', tab: '2', side: 'right' });
    assert.strictEqual(tool.folderOf(tab), at('Users'));

    await send({ type: 'activate', tab: '1', side: 'right' });
    assert.strictEqual(tool.folderOf(tab), root);
  });

  test('watches the folders of the tab shown, listing a side again when its folder changes', async () => {
    const listed: Record<string, Listed> = {
      [root]: [folder('Users')],
      [at('Users')]: [],
    };
    const { tool, page, send, watched, change } = commander(listed);
    await tool.show(page, tab);
    assert.deepStrictEqual(watched(), [root, root]);

    await send({ type: 'open', tab: '1', side: 'right', name: 'Users' });
    assert.deepStrictEqual(watched(), [root, at('Users')].toSorted());

    listed[at('Users')] = [file('new.txt')];
    await change(at('Users'));
    assert.deepStrictEqual(
      page.listings().at(-1),
      `right ${at('Users')} ↑: new.txt`,
    );

    tool.hide(page);
    assert.deepStrictEqual(watched(), []);
    await tool.show(page, tab);
    assert.deepStrictEqual(watched(), [root, at('Users')].toSorted());
    tool.closed(page, tab);
    assert.deepStrictEqual(watched(), []);
  });

  test('watches the folder of a side from how it was before it was listed, not once the listing is done, so a file made while it was listed is listed too', async () => {
    const listed: Record<string, Listed> = {
      [root]: [folder('Users')],
      [at('Users')]: [],
    };
    const { tool, page, send, watchedAsListed } = commander(listed);
    await tool.show(page, tab);

    await send({ type: 'open', tab: '1', side: 'right', name: 'Users' });

    assert.strictEqual(watchedAsListed(at('Users')), 'listed 0 times');
  });

  test('lists a changed folder again once at a time, once more after a listing that was slow, so an older listing never lands after a newer one', async () => {
    const slow = Promise.withResolvers<readonly Entry[]>();
    const listed: Record<string, Listed> = { [root]: [] };
    const { tool, page, change } = commander(listed);
    await tool.show(page, tab);

    listed[root] = slow.promise;
    await change(root);
    listed[root] = [file('new.txt')];
    await change(root);
    slow.resolve([file('old.txt')]);
    await new Promise((resolve) => setTimeout(resolve, 10));

    const last = (side: string) =>
      page
        .listings()
        .filter((listing) => listing.startsWith(`${side} `))
        .at(-1);
    assert.deepStrictEqual(
      [last('left'), last('right')],
      [`left ${root}: new.txt`, `right ${root}: new.txt`],
    );
  });

  test('tells the page a tab was closed, so it forgets what it kept of the tab, as a tab opened later can take its id', async () => {
    const { tool, page } = commander({ [root]: [] });
    await tool.show(page, tab);
    tool.closed(page, tab);
    assert.deepStrictEqual(page.of('closed'), [{ type: 'closed', tab: '1' }]);
  });

  test('goes on opening a folder when the folder it leaves changes meanwhile, and drops a listing of that folder begun before the opening', async () => {
    const opening = Promise.withResolvers<readonly Entry[]>();
    const listed: Record<string, Listed> = {
      [root]: [folder('slow')],
      [at('slow')]: opening.promise,
    };
    const { tool, page, send, change } = commander(listed);
    await tool.show(page, tab);

    const opened = send({ type: 'open', tab: '1', side: 'left', name: 'slow' });
    listed[root] = [folder('slow'), file('new.txt')];
    await change(root);
    opening.resolve([file('inside.txt')]);
    await opened;

    assert.deepStrictEqual(
      page
        .listings()
        .filter((listing) => listing.startsWith('left '))
        .at(-1),
      `left ${at('slow')} ↑: inside.txt`,
    );

    const refreshing = Promise.withResolvers<readonly Entry[]>();
    listed[at('slow')] = refreshing.promise;
    await change(at('slow'));
    await send({ type: 'open', tab: '1', side: 'left', name: '..' });
    refreshing.resolve([file('stale.txt')]);
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.deepStrictEqual(
      page
        .listings()
        .filter((listing) => listing.startsWith('left '))
        .at(-1),
      `left ${root}: slow new.txt [slow]`,
    );
  });

  test('keeps a side as it was, saying nothing, when its folder changes but can no longer be read', async () => {
    const listed: Record<string, Listed> = { [root]: [file('a.txt')] };
    const { tool, page, notices, change } = commander(listed);
    await tool.show(page, tab);

    listed[root] = Object.assign(new Error('denied'), { code: 'EPERM' });
    await change(root);

    assert.deepStrictEqual(page.listings(), [
      `left ${root}: a.txt`,
      `right ${root}: a.txt`,
    ]);
    assert.deepStrictEqual(notices, []);
  });

  test('lists the root on the right when the folder the tab was opened with is gone', async () => {
    const { tool, page } = commander({ [root]: [] });

    await tool.show(page, { ...tab, root: at('gone-folder-of-a-tab') });

    assert.deepStrictEqual(page.listings(), [
      `left ${root}: `,
      `right ${root}: `,
    ]);
  });

  suite('started again', () => {
    test('opens each side of a tab at the folder it last listed', async () => {
      const listed: Record<string, Listed> = {
        [root]: [folder('Users'), folder('Windows')],
        [at('Users')]: [folder('me')],
        [at('Users', 'me')]: [],
        [at('Windows')]: [],
      };
      const before = commander(listed);
      await before.tool.show(before.page, tab);
      await before.send({
        type: 'open',
        tab: '1',
        side: 'left',
        name: 'Users',
      });
      await before.send({ type: 'open', tab: '1', side: 'left', name: 'me' });
      await before.send({
        type: 'open',
        tab: '1',
        side: 'right',
        name: 'Windows',
      });
      await before.settled();

      const { tool, page } = commander(listed, [], undefined, before.state);
      await tool.show(page, tab);

      assert.deepStrictEqual(page.listings(), [
        `left ${at('Users', 'me')} ↑: `,
        `right ${at('Windows')} ↑: `,
      ]);
    });

    test('opens the right side of a tab at the folder it was opened with while that side has not moved', async () => {
      const opened = tempFolder('commander');
      try {
        const listed: Record<string, Listed> = {
          [root]: [folder('Users')],
          [at('Users')]: [],
          [opened]: [],
        };
        const shown = { ...tab, root: opened };
        const before = commander(listed);
        await before.tool.show(before.page, shown);
        await before.send({
          type: 'open',
          tab: '1',
          side: 'left',
          name: 'Users',
        });
        await before.settled();

        const { tool, page } = commander(listed, [], undefined, before.state);
        await tool.show(page, shown);

        assert.deepStrictEqual(page.listings(), [
          `left ${at('Users')} ↑: `,
          `right ${opened} ↑: `,
        ]);
      } finally {
        removeFolder(opened);
      }
    });

    test('opens a side at the nearest folder still there when the one it last listed is gone', async () => {
      const listed: Record<string, Listed> = {
        [root]: [folder('fastforward-made-up')],
        [at('fastforward-made-up')]: [],
      };
      const before = commander(listed);
      await before.tool.show(before.page, tab);
      await before.send({
        type: 'open',
        tab: '1',
        side: 'left',
        name: 'fastforward-made-up',
      });
      await before.settled();
      delete listed[at('fastforward-made-up')];

      const { tool, page, notices } = commander(
        listed,
        [],
        undefined,
        before.state,
      );
      await tool.show(page, tab);

      assert.strictEqual(lastFolder(page, '1', 'left'), root);
      assert.deepStrictEqual(notices, []);
    });

    test('opens a side at the folder it last listed without administrator, rather than asking to read one as administrator again', async () => {
      const helper: ElevatedFileSystem = {
        list: () => Promise.resolve([file('secret.txt')]),
        drives: () => Promise.resolve([]),
        watch: () => () => {},
        closed: new Promise(() => {}),
        close: () => {},
      };
      const listed: Record<string, Listed> = {
        [root]: [folder('Users')],
        [at('Users')]: [folder('Locked')],
        [at('Users', 'Locked')]: Object.assign(new Error('denied'), {
          code: 'EPERM',
        }),
      };
      const before = commander(listed, [], () => Promise.resolve(helper));
      await before.tool.show(before.page, tab);
      await before.send({
        type: 'open',
        tab: '1',
        side: 'left',
        name: 'Users',
      });
      await before.send({
        type: 'open',
        tab: '1',
        side: 'left',
        name: 'Locked',
      });
      await before.send({ type: 'elevate', tab: '1', side: 'left' });
      await before.settled();
      assert.strictEqual(
        lastFolder(before.page, '1', 'left'),
        at('Users', 'Locked'),
      );

      const { tool, page } = commander(listed, [], undefined, before.state);
      await tool.show(page, tab);

      assert.strictEqual(lastFolder(page, '1', 'left'), at('Users'));
      assert.deepStrictEqual(page.of('noAccess'), []);
    });

    test('forgets the folders of a tab once it is closed, and of tabs gone once the page is ready, as a new tab may take the number of one', async () => {
      const listed: Record<string, Listed> = {
        [root]: [folder('Users')],
        [at('Users')]: [],
      };
      const tabs: Tab[] = ['1', '2', '3'].map((id) => ({
        id,
        tool: 'commander',
      }));
      const before = commander(listed);
      for (const each of tabs) {
        await before.tool.show(before.page, each);
        await before.send({
          type: 'open',
          tab: each.id,
          side: 'left',
          name: 'Users',
        });
      }
      await before.settled();
      before.tool.closed(before.page, tabs[0]);

      const after = commander(listed, [], undefined, before.state);
      after.tabs.push(tabs[0], tabs[1]);
      after.tool.ready(after.page);
      await after.settled();
      after.tabs.push(tabs[2]);
      for (const each of tabs) {
        await after.tool.show(after.page, each);
      }

      assert.deepStrictEqual(
        tabs.map((each) => lastFolder(after.page, each.id, 'left')),
        [root, at('Users'), root],
      );
    });
  });

  test('opens a folder of a side, and goes up from it selecting the folder it came from', async () => {
    const { tool, page, send } = commander({
      [root]: [folder('Users'), file('notes.txt')],
      [at('Users')]: [folder('me')],
    });
    await tool.show(page, tab);

    await send({ type: 'open', tab: '1', side: 'right', name: 'Users' });
    await send({ type: 'open', tab: '1', side: 'right', name: '..' });

    assert.deepStrictEqual(page.listings().slice(2), [
      `right ${at('Users')} ↑: me`,
      `right ${root}: Users notes.txt [Users]`,
    ]);
  });

  test('leaves a side going to another folder to get there when the folder it is leaving is deleted meanwhile, as listing the nearest folder still there took it elsewhere', async () => {
    const listed: Record<string, Listed> = {
      [root]: [folder('fastforward-made-up')],
      [at('fastforward-made-up')]: [folder('gone')],
      [at('fastforward-made-up', 'gone')]: [],
    };
    const { tool, page, send, change } = commander(listed);
    await tool.show(page, tab);
    await send({
      type: 'open',
      tab: '1',
      side: 'left',
      name: 'fastforward-made-up',
    });
    await send({ type: 'open', tab: '1', side: 'left', name: 'gone' });
    const slow = Promise.withResolvers<readonly Entry[]>();
    listed[at('fastforward-made-up')] = slow.promise;
    const going = send({ type: 'step', tab: '1', side: 'left', step: -1 });
    delete listed[at('fastforward-made-up', 'gone')];
    await change(at('fastforward-made-up', 'gone'));
    slow.resolve([folder('gone')]);
    await going;
    await new Promise((resolve) => setTimeout(resolve, 10));
    const last = page
      .of('listing')
      .filter((each) => each.side === 'left')
      .at(-1);
    assert.strictEqual(last?.folder, at('fastforward-made-up'));
  });

  test('goes back and forward through the folders a side was in, selecting the folder it came from, and forgets those ahead once another is opened', async () => {
    const { tool, page, send } = commander({
      [root]: [folder('Users'), folder('Windows')],
      [at('Users')]: [folder('me')],
      [at('Users', 'me')]: [],
      [at('Windows')]: [],
    });
    await tool.show(page, tab);
    const step = (value: -1 | 1) =>
      send({ type: 'step', tab: '1', side: 'left', step: value });
    const last = () => {
      const listing = page.of('listing').at(-1);
      return (
        listing && [
          listing.folder,
          listing.selected,
          listing.back,
          listing.forward,
        ]
      );
    };

    await send({ type: 'open', tab: '1', side: 'left', name: 'Users' });
    await send({ type: 'open', tab: '1', side: 'left', name: 'me' });
    assert.deepStrictEqual(last(), [at('Users', 'me'), undefined, true, false]);

    await step(-1);
    assert.deepStrictEqual(last(), [at('Users'), 'me', true, true]);
    await step(-1);
    assert.deepStrictEqual(last(), [root, 'Users', false, true]);
    const listed = page.of('listing').length;
    await step(-1);
    assert.strictEqual(page.of('listing').length, listed);

    await step(1);
    assert.deepStrictEqual(last(), [at('Users'), undefined, true, true]);
    await send({ type: 'open', tab: '1', side: 'left', name: '..' });
    await send({ type: 'open', tab: '1', side: 'left', name: 'Windows' });
    assert.deepStrictEqual(last(), [at('Windows'), undefined, true, false]);
    await step(-1);
    await step(-1);
    await step(-1);
    assert.deepStrictEqual(last(), [root, 'Users', false, true]);

    await send(
      forged('{ "type": "step", "tab": "1", "side": "left", "step": 2 }'),
    );
    assert.deepStrictEqual(last(), [root, 'Users', false, true]);
  });

  test('opens on a side the folder selected on the other, or the folder the other is in for .. or a file', async () => {
    const { tool, page, send } = commander({
      [root]: [folder('Users'), file('notes.txt')],
      [at('Users')]: [folder('me')],
      [at('Users', 'me')]: [],
    });
    await tool.show(page, tab);
    await send({ type: 'open', tab: '1', side: 'right', name: 'Users' });
    const onSide = (side: 'left' | 'right', name: string) =>
      send({ type: 'openOnSide', tab: '1', from: 'right', side, name });

    await onSide('left', 'me');
    await onSide('left', '..');
    await onSide('left', 'notes.txt');
    await send({ type: 'open', tab: '1', side: 'right', name: '..' });
    await onSide('left', 'notes.txt');
    await onSide('right', 'Users');

    assert.deepStrictEqual(page.listings().slice(3), [
      `left ${at('Users', 'me')} ↑: `,
      `left ${at('Users')} ↑: me [me]`,
      `right ${root}: Users notes.txt [Users]`,
      `left ${root}: Users notes.txt [Users]`,
      `right ${at('Users')} ↑: me`,
    ]);
  });

  test('opens on a side only what the other side lists, for the shown tab', async () => {
    const { tool, page, send } = commander({
      [root]: [folder('Users')],
      [at('Users')]: [],
      [at('Windows')]: [],
    });
    await tool.show(page, tab);

    await send({
      type: 'openOnSide',
      tab: '1',
      from: 'right',
      side: 'left',
      name: 'Windows',
    });
    await send({
      type: 'openOnSide',
      tab: '2',
      from: 'right',
      side: 'left',
      name: 'Users',
    });
    await send(
      forged(
        '{ "type": "openOnSide", "tab": "1", "from": "right", "side": "middle", "name": "Users" }',
      ),
    );
    await send(
      forged(
        '{ "type": "openOnSide", "tab": "1", "from": "middle", "side": "left", "name": "Users" }',
      ),
    );

    assert.deepStrictEqual(page.listings().slice(2), []);
  });

  test('reads a side again when asked, without going anywhere in its history, saying why when it can’t', async () => {
    const listed: Record<string, Listed> = {
      [root]: [folder('Users')],
      [at('Users')]: [file('a.txt')],
    };
    const { tool, page, send, notices } = commander(listed);
    await tool.show(page, tab);
    await send({ type: 'open', tab: '1', side: 'left', name: 'Users' });

    listed[at('Users')] = [file('a.txt'), file('b.txt')];
    await send({ type: 'reread', tab: '1', side: 'left' });
    const last = page.of('listing').at(-1);
    assert.deepStrictEqual(
      last && [last.folder, last.entries.map((entry) => entry.name), last.back],
      [at('Users'), ['a.txt', 'b.txt'], true],
    );

    listed[at('Users')] = Object.assign(new Error('the disk is gone'), {
      code: 'EIO',
    });
    await send({ type: 'reread', tab: '1', side: 'left' });
    await send({ type: 'reread', tab: '2', side: 'left' });
    await send(forged('{ "type": "reread", "tab": "1", "side": "middle" }'));
    assert.deepStrictEqual(notices, [
      {
        level: 'error',
        message: strings.commander.couldNotOpen(
          at('Users'),
          'the disk is gone',
        ),
      },
    ]);
  });

  test('opens a tab viewing a file the side lists, and nothing for a folder, ..  or a name it doesn’t list', async () => {
    const { tool, page, send, viewed } = commander({
      [root]: [folder('Users'), file('notes.txt')],
    });
    await tool.show(page, tab);

    for (const name of ['notes.txt', 'Users', '..', 'secret.txt']) {
      await send({ type: 'view', tab: '1', side: 'left', name });
    }
    await send({ type: 'view', tab: '2', side: 'left', name: 'notes.txt' });

    assert.deepStrictEqual(viewed, [at('notes.txt')]);
  });

  test('shows the menu of the system for the files and folders a side lists, or for the folder it shows when the page names none, where the page says, the extended one with Shift, and none for ..  or a name it doesn’t list', async () => {
    const { tool, page, send, menus } = commander({
      [root]: [folder('Users'), file('notes.txt'), file('other.txt')],
    });
    await tool.show(page, tab);
    const menu = (names: unknown, extended: unknown = false) =>
      send(
        forged(
          JSON.stringify({
            type: 'shellMenu',
            tab: '1',
            side: 'left',
            names,
            x: 10,
            y: 20,
            extended,
          }),
        ),
      );

    await menu(['notes.txt', 'Users']);
    await menu(['other.txt'], true);
    await menu([]);
    for (const names of [
      ['..'],
      ['secret.txt'],
      ['notes.txt', 'secret.txt'],
      'notes.txt',
      [1],
    ]) {
      await menu(names);
    }
    await menu(['notes.txt'], 'yes');
    await send({
      type: 'shellMenu',
      tab: '2',
      side: 'left',
      names: ['notes.txt'],
      x: 10,
      y: 20,
      extended: false,
    });
    await send({
      type: 'shellMenu',
      tab: '1',
      side: 'left',
      names: ['notes.txt'],
      x: Number.NaN,
      y: 20,
      extended: false,
    });

    assert.deepStrictEqual(menus, [
      {
        files: [at('notes.txt'), at('Users')],
        at: { x: 10, y: 20 },
        extended: false,
      },
      { files: [at('other.txt')], at: { x: 10, y: 20 }, extended: true },
      { files: [root], at: { x: 10, y: 20 }, extended: false },
    ]);
  });

  test('opens a new terminal or a git tab in the folder a side shows or a folder it lists, and asks git to clone into it or init one in it, and does nothing for a file, .. , a name it doesn’t list, another tab or a command it doesn’t know', async () => {
    const { tool, page, send, openedIn, clonedInto, initedIn } = commander({
      [root]: [folder('app'), file('notes.txt')],
    });
    await tool.show(page, tab);
    const command = (asked: unknown, name?: unknown, on = '1') =>
      send(
        forged(
          JSON.stringify({
            type: 'folderCommand',
            tab: on,
            side: 'left',
            ...(name !== undefined && { name }),
            command: asked,
          }),
        ),
      );

    await command('newTerminal');
    await command('openInGit', 'app');
    await command('cloneHere', 'app');
    await command('initHere');
    await command('newTerminal', 'notes.txt');
    await command('newTerminal', '..');
    await command('newTerminal', 'elsewhere');
    await command('newTerminal', 5);
    await command('newTerminal', undefined, '2');
    await command('format');

    assert.deepStrictEqual(openedIn, [
      { tool: 'terminal', folders: [root] },
      { tool: 'git', folders: [at('app')] },
    ]);
    assert.deepStrictEqual(clonedInto, [at('app')]);
    assert.deepStrictEqual(initedIn, [root]);
  });

  test('tells the page the folder a side shows is in a repository once it is listed, and again when it is read again', async () => {
    const listed: Record<string, Listed> = {
      [root]: [folder('app')],
      [at('app')]: [folder('src')],
    };
    const { tool, page, send, change, insideRepositories, settled } =
      commander(listed);
    insideRepositories.add(at('app'));
    await tool.show(page, tab);
    await settled();
    await send({ type: 'open', tab: '1', side: 'left', name: 'app' });
    await settled();
    insideRepositories.delete(at('app'));
    await change(at('app'));
    await settled();

    assert.deepStrictEqual(
      page
        .of('repositories')
        .filter((found) => found.side === 'left')
        .map((found) => [found.folder, found.inRepository]),
      [
        [root, undefined],
        [at('app'), true],
        [at('app'), undefined],
      ],
    );
  });

  test('opens a git tab comparing two files the sides list, the first the old side, and nothing for a folder, ..  or a name it doesn’t list', async () => {
    const { tool, page, send, compared } = commander({
      [root]: [folder('Users'), file('notes.txt'), file('other.txt')],
    });
    await tool.show(page, tab);
    const compare = (
      one: readonly [Side, string],
      other: readonly [Side, string],
      on = '1',
    ) =>
      send({
        type: 'compare',
        tab: on,
        files: [
          { side: one[0], folder: root, name: one[1] },
          { side: other[0], folder: root, name: other[1] },
        ],
      });

    await compare(['left', 'notes.txt'], ['right', 'other.txt']);
    await compare(['right', 'other.txt'], ['right', 'notes.txt']);
    await compare(['left', 'Users'], ['right', 'other.txt']);
    await compare(['left', '..'], ['right', 'other.txt']);
    await compare(['left', 'secret.txt'], ['right', 'other.txt']);
    await compare(['left', 'notes.txt'], ['right', 'other.txt'], '2');
    await send(
      forged('{ "type": "compare", "tab": "1", "files": "notes.txt" }'),
    );

    assert.deepStrictEqual(compared, [
      { tool: 'git', old: at('notes.txt'), new: at('other.txt') },
      { tool: 'git', old: at('other.txt'), new: at('notes.txt') },
    ]);
  });

  test('says how to pick the files to compare when the page has none to compare, opening nothing, and says nothing for a list the page forged', async () => {
    const { tool, page, send, compared, notices } = commander({
      [root]: [file('notes.txt')],
    });
    await tool.show(page, tab);

    await send({ type: 'compare', tab: '1', files: [] });
    await send(forged('{ "type": "compare", "tab": "1", "files": [1] }'));

    assert.deepStrictEqual(compared, []);
    assert.deepStrictEqual(notices, [
      { level: 'info', message: strings.commander.nothingToCompare },
    ]);
  });

  test('names the folders a side lists that are repositories once it is listed, never asking about files, and again when the folder is read again', async () => {
    const listed: Record<string, Listed> = {
      [root]: [folder('app'), folder('docs'), file('notes.txt')],
    };
    const { tool, page, change, repositories, repositoriesAsked, settled } =
      commander(listed);
    repositories.add(at('app'));
    await tool.show(page, tab);
    await settled();

    assert.deepStrictEqual(page.of('repositories'), [
      {
        type: 'repositories',
        tab: '1',
        side: 'left',
        folder: root,
        names: ['app'],
      },
      {
        type: 'repositories',
        tab: '1',
        side: 'right',
        folder: root,
        names: ['app'],
      },
    ]);
    assert.ok(!repositoriesAsked.includes(at('notes.txt')));

    repositories.add(at('docs'));
    listed[root] = [
      folder('app'),
      { ...folder('docs'), modified: 1 },
      file('notes.txt'),
    ];
    await change(root);
    await settled();
    assert.deepStrictEqual(page.of('repositories').at(-1)?.names, [
      'app',
      'docs',
    ]);
  });

  test('looks again only at the folders that came or changed once a side is listed again as its folder changes, keeping what it found of the others, as each change looked at every folder again', async () => {
    const listed: Record<string, Listed> = {
      [root]: [folder('app'), folder('docs'), folder('lib')],
    };
    const {
      tool,
      page,
      send,
      change,
      repositories,
      repositoriesAsked,
      settled,
    } = commander(listed);
    repositories.add(at('app'));
    repositories.add(at('new'));
    await tool.show(page, tab);
    await settled();
    repositoriesAsked.length = 0;

    listed[root] = [
      folder('app'),
      { ...folder('docs'), modified: 1 },
      folder('new'),
    ];
    await change(root);
    await settled();

    assert.deepStrictEqual(repositoriesAsked.toSorted(), [
      at('docs'),
      at('docs'),
      at('new'),
      at('new'),
    ]);
    assert.deepStrictEqual(page.of('repositories').at(-1)?.names, [
      'app',
      'new',
    ]);
    repositoriesAsked.length = 0;
    await send({ type: 'reread', tab: '1', side: 'left' });
    await settled();
    assert.deepStrictEqual(repositoriesAsked.toSorted(), [
      at('app'),
      at('docs'),
      at('new'),
    ]);
  });

  test('drops the repositories found in a folder a side has left meanwhile', async () => {
    const listed: Record<string, Listed> = {
      [root]: [folder('app'), folder('Users')],
      [at('Users')]: [folder('me')],
    };
    const { tool, page, send, repositories, settled, repositoriesHeld } =
      commander(listed);
    repositories.add(at('app'));
    const held = Promise.withResolvers<void>();
    repositoriesHeld.until = held.promise;
    await tool.show(page, tab);
    repositoriesHeld.until = undefined;
    await send({ type: 'open', tab: '1', side: 'right', name: 'Users' });
    held.resolve();
    await settled();

    assert.deepStrictEqual(
      page
        .of('repositories')
        .map((found) => `${found.side} ${found.folder} ${found.names.join()}`)
        .toSorted(),
      [`left ${root} app`, `right ${at('Users')} `],
    );
  });

  test('opens a repository a side lists in a git tab, and nothing for a folder that isn’t one, a file, .. , a name it doesn’t list or another tab', async () => {
    const { tool, page, send, repositories, settled, openedIn } = commander({
      [root]: [folder('app'), folder('docs'), file('notes.txt')],
    });
    repositories.add(at('app'));
    await tool.show(page, tab);
    await settled();
    const open = (name: string, on = '1') =>
      send({ type: 'openRepository', tab: on, side: 'left', name });

    await open('app');
    await open('docs');
    await open('notes.txt');
    await open('..');
    await open('elsewhere');
    await open('app', '2');
    await send(
      forged(
        '{ "type": "openRepository", "tab": "1", "side": "up", "name": "app" }',
      ),
    );

    assert.deepStrictEqual(openedIn, [{ tool: 'git', folders: [at('app')] }]);
  });

  test('gives a viewing tab the icon of its file, at an address naming the file, as a closed tab’s id comes back for another file, served for that tab and file only', async () => {
    const { tool, tabs, iconsLoaded } = commander({});
    const viewing: Tab = {
      id: '3',
      tool: 'commander',
      root: at('notes.txt'),
      view: true,
    };
    tabs.push(viewing, { id: '4', tool: 'commander', root });
    const icon = tool.names([viewing]).get('3')?.icon;
    assert.strictEqual(icon, viewerIconUrl('3', at('notes.txt')));
    assert.notStrictEqual(
      tool.names([{ ...viewing, root: at('other.md') }]).get('3')?.icon,
      icon,
    );

    const served = async (url: string) =>
      (await tool.icon(new URL(`fastforward://app${url}`))).status;
    assert.strictEqual(await served(viewerIconUrl('3', at('notes.txt'))), 200);
    assert.strictEqual(await served(viewerIconUrl('3', at('other.md'))), 404);
    assert.strictEqual(await served(viewerIconUrl('4', root)), 404);
    assert.strictEqual(await served(viewerIconUrl('5', at('notes.txt'))), 404);
    assert.deepStrictEqual(iconsLoaded, [at('notes.txt')]);
    assert.strictEqual(
      tool.names([{ id: '4', tool: 'commander', root }]).get('4')?.icon,
      undefined,
    );
  });

  test('names a viewing tab after its file and gives its folder as the folder of the tab, showing it without sides', async () => {
    const { tool, page } = commander({ [root]: [file('notes.txt')] });
    const viewing: Tab = {
      id: '3',
      tool: 'commander',
      root: at('notes.txt'),
      view: true,
    };

    assert.strictEqual(tool.names([viewing]).get('3')?.name, 'notes.txt');
    assert.strictEqual(tool.folderOf(viewing), root);
    await tool.show(page, viewing);
    assert.deepStrictEqual(page.of('show'), [
      { type: 'show', tab: '3', file: at('notes.txt') },
    ]);
    assert.deepStrictEqual(page.listings(), []);
  });

  test('opens only folders the side listed, and nothing above the root, for the shown tab', async () => {
    const { tool, page, send } = commander({
      [root]: [folder('Users'), file('notes.txt')],
      [at('Users')]: [],
      [at('Windows')]: [],
    });
    await tool.show(page, tab);

    await send({ type: 'open', tab: '1', side: 'left', name: '..' });
    await send({ type: 'open', tab: '1', side: 'left', name: 'notes.txt' });
    await send({ type: 'open', tab: '1', side: 'left', name: 'Windows' });
    await send({ type: 'open', tab: '1', side: 'left', name: '../Windows' });
    await send({ type: 'open', tab: '2', side: 'left', name: 'Users' });
    await send(
      forged(
        '{ "type": "open", "tab": "1", "side": "middle", "name": "Users" }',
      ),
    );
    await send(
      forged('{ "type": "open", "tab": "1", "side": "left", "name": 7 }'),
    );
    await send(
      { type: 'open', tab: '1', side: 'left', name: 'Users' },
      {
        post: () => {},
        disposed: false,
      },
    );

    assert.deepStrictEqual(page.listings().slice(2), []);
  });

  test('keeps the folder of a side and asks the page to say there is no access, in a window rather than a notice, when another can’t be read', async () => {
    const { tool, page, send, notices } = commander({
      [root]: [folder('System Volume Information'), folder('Config.Msi')],
      [at('System Volume Information')]: Object.assign(new Error('denied'), {
        code: 'EPERM',
      }),
      [at('Config.Msi')]: Object.assign(new Error('denied'), {
        code: 'EACCES',
      }),
    });
    await tool.show(page, tab);

    await send({
      type: 'open',
      tab: '1',
      side: 'left',
      name: 'System Volume Information',
    });
    await send({ type: 'open', tab: '1', side: 'right', name: 'Config.Msi' });

    assert.deepStrictEqual(page.of('noAccess'), [
      {
        type: 'noAccess',
        side: 'left',
        folder: at('System Volume Information'),
        asAdministrator: false,
      },
      {
        type: 'noAccess',
        side: 'right',
        folder: at('Config.Msi'),
        asAdministrator: false,
      },
    ]);
    assert.deepStrictEqual(notices, []);
    assert.deepStrictEqual(page.listings().slice(2), [
      `left ${root}: System Volume Information Config.Msi`,
      `right ${root}: System Volume Information Config.Msi`,
    ]);
  });

  test('lists a folder it has no access to as administrator once the page asks, the helper started once, and further folders through it at once', async () => {
    const listed: Record<string, Listed> = {
      [root]: [folder('Config.Msi'), folder('System Volume Information')],
    };
    const stopped = Promise.withResolvers<void>();
    const helper: ElevatedFileSystem = {
      list: (each) =>
        Promise.resolve([file(`${path.basename(each)} as admin.txt`)]),
      drives: () => Promise.resolve([]),
      watch: () => () => {},
      closed: stopped.promise,
      close: () => stopped.resolve(),
    };
    let asked = 0;
    const { tool, page, send } = commander(listed, [], () => {
      asked++;
      return Promise.resolve(helper);
    });
    for (const each of ['Config.Msi', 'System Volume Information']) {
      listed[at(each)] = Object.assign(new Error('denied'), { code: 'EPERM' });
    }
    await tool.show(page, tab);
    assert.strictEqual(page.of('settings').length, 0);
    tool.ready(page);
    assert.strictEqual(page.of('settings').at(-1)?.canElevate, true);

    await send({ type: 'elevate', tab: '1', side: 'left' });
    assert.strictEqual(asked, 0);

    await send({ type: 'open', tab: '1', side: 'left', name: 'Config.Msi' });
    await send({ type: 'elevate', tab: '1', side: 'left' });
    await send({ type: 'open', tab: '1', side: 'left', name: '..' });
    await send({
      type: 'open',
      tab: '1',
      side: 'left',
      name: 'System Volume Information',
    });

    assert.strictEqual(asked, 1);
    assert.deepStrictEqual(page.of('noAccess').length, 1);
    assert.deepStrictEqual(page.listings().slice(3), [
      `left ${at('Config.Msi')} ↑: Config.Msi as admin.txt`,
      `left ${root}: Config.Msi System Volume Information [Config.Msi]`,
      `left ${at('System Volume Information')} ↑: System Volume Information as admin.txt`,
    ]);
    assert.deepStrictEqual(
      page
        .of('listing')
        .slice(3)
        .map((listing) => listing.elevated),
      [true, false, true],
    );

    stopped.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepStrictEqual(page.of('noAccess').length, 2);
    await send({ type: 'open', tab: '1', side: 'left', name: '..' });
    await send({ type: 'open', tab: '1', side: 'left', name: 'Config.Msi' });
    assert.deepStrictEqual(page.of('noAccess').length, 3);
  });

  test('lists the other side through the helper already running, and lists a folder denied before no more once a side has moved on, as a second helper was started and the first left running', async () => {
    const listed: Record<string, Listed> = {
      [root]: [folder('Config.Msi'), folder('System Volume Information')],
    };
    const closed: string[] = [];
    const helperNamed = (name: string): ElevatedFileSystem => ({
      list: (each) =>
        Promise.resolve([file(`${path.basename(each)} by ${name}.txt`)]),
      drives: () => Promise.resolve([]),
      watch: () => () => {},
      closed: new Promise(() => {}),
      close: () => closed.push(name),
    });
    let asked = 0;
    const { tool, page, send } = commander(listed, [], () =>
      Promise.resolve(helperNamed(`helper ${++asked}`)),
    );
    for (const each of ['Config.Msi', 'System Volume Information']) {
      listed[at(each)] = Object.assign(new Error('denied'), { code: 'EPERM' });
    }
    await tool.show(page, tab);
    await send({ type: 'open', tab: '1', side: 'left', name: 'Config.Msi' });
    await send({
      type: 'open',
      tab: '1',
      side: 'right',
      name: 'System Volume Information',
    });

    await send({ type: 'elevate', tab: '1', side: 'left' });
    await tool.show(page, tab);
    await send({ type: 'elevate', tab: '1', side: 'right' });
    await send({ type: 'open', tab: '1', side: 'left', name: '..' });
    await send({ type: 'elevate', tab: '1', side: 'left' });

    assert.strictEqual(asked, 1);
    assert.deepStrictEqual(closed, []);
    assert.deepStrictEqual(page.listings().slice(4), [
      `left ${at('Config.Msi')} ↑: Config.Msi by helper 1.txt`,
      `right ${root}: Config.Msi System Volume Information`,
      `left ${at('Config.Msi')} ↑: Config.Msi by helper 1.txt`,
      `right ${at('System Volume Information')} ↑: System Volume Information by helper 1.txt`,
      `left ${root}: Config.Msi System Volume Information [Config.Msi]`,
    ]);
  });

  test('opens where a link points when the link itself can’t be listed, as Documents and Settings, which no one may list', async () => {
    const { tool, page, send } = commander({
      [root]: [{ ...folder('Documents and Settings'), link: true }],
      [at('Documents and Settings')]: Object.assign(new Error('denied'), {
        code: 'EPERM',
      }),
      [at('Users')]: [folder('me')],
    });
    await tool.show(page, tab);

    await send({
      type: 'open',
      tab: '1',
      side: 'left',
      name: 'Documents and Settings',
    });

    assert.deepStrictEqual(page.of('noAccess'), []);
    assert.deepStrictEqual(page.listings().slice(2), [
      `left ${at('Users')} ↑: me`,
    ]);
  });

  test('says there is no access even as administrator, offering nothing more, when the helper is refused too', async () => {
    const denied = Object.assign(new Error('denied'), { code: 'EPERM' });
    const helper: ElevatedFileSystem = {
      list: () => Promise.reject(denied),
      drives: () => Promise.resolve([]),
      watch: () => () => {},
      closed: new Promise(() => {}),
      close: () => {},
    };
    const { tool, page, send } = commander(
      {
        [root]: [folder('Locked'), folder('Config.Msi')],
        [at('Locked')]: denied,
        [at('Config.Msi')]: denied,
      },
      [],
      () => Promise.resolve(helper),
    );
    await tool.show(page, tab);

    await send({ type: 'open', tab: '1', side: 'left', name: 'Config.Msi' });
    await send({ type: 'elevate', tab: '1', side: 'left' });
    await send({ type: 'open', tab: '1', side: 'left', name: 'Locked' });

    assert.deepStrictEqual(page.of('noAccess'), [
      {
        type: 'noAccess',
        side: 'left',
        folder: at('Config.Msi'),
        asAdministrator: true,
      },
      {
        type: 'noAccess',
        side: 'left',
        folder: at('Config.Msi'),
        asAdministrator: false,
      },
      {
        type: 'noAccess',
        side: 'left',
        folder: at('Locked'),
        asAdministrator: false,
      },
    ]);
  });

  test('watches a folder read as administrator through the helper, listing it again as it changes', async () => {
    const helperWatching: { folder: string; changed: () => void }[] = [];
    const listed: Record<string, Listed> = {
      [root]: [folder('Config.Msi')],
      [at('Config.Msi')]: Object.assign(new Error('denied'), { code: 'EPERM' }),
    };
    let inside = [file('a.txt')];
    const helper: ElevatedFileSystem = {
      list: () => Promise.resolve(inside),
      drives: () => Promise.resolve([]),
      watch: (watched, changed) => {
        const watch = { folder: watched, changed };
        helperWatching.push(watch);
        return () => helperWatching.splice(helperWatching.indexOf(watch), 1);
      },
      closed: new Promise(() => {}),
      close: () => {},
    };
    const { tool, page, send, watched } = commander(listed, [], () =>
      Promise.resolve(helper),
    );
    await tool.show(page, tab);
    await send({ type: 'open', tab: '1', side: 'left', name: 'Config.Msi' });
    await send({ type: 'elevate', tab: '1', side: 'left' });

    assert.deepStrictEqual(
      helperWatching.map((watch) => watch.folder),
      [at('Config.Msi')],
    );
    assert.deepStrictEqual(watched(), [root]);

    inside = [file('a.txt'), file('b.txt')];
    helperWatching[0]?.changed();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepStrictEqual(
      page.listings().at(-1),
      `left ${at('Config.Msi')} ↑: a.txt b.txt`,
    );

    await send({ type: 'open', tab: '1', side: 'left', name: '..' });
    assert.deepStrictEqual(helperWatching, []);
    assert.deepStrictEqual(watched(), [root, root]);
  });

  test('says when the helper couldn’t be started, staying where it was', async () => {
    const { tool, page, send, notices } = commander(
      {
        [root]: [folder('Config.Msi')],
        [at('Config.Msi')]: Object.assign(new Error('denied'), {
          code: 'EPERM',
        }),
      },
      [],
      () => Promise.reject(new Error('The helper didn’t connect')),
    );
    await tool.show(page, tab);
    await send({ type: 'open', tab: '1', side: 'left', name: 'Config.Msi' });
    await send({ type: 'elevate', tab: '1', side: 'left' });

    assert.deepStrictEqual(notices, [
      { level: 'error', message: strings.commander.helperFailed },
    ]);
    assert.deepStrictEqual(page.listings().slice(2), [
      `left ${root}: Config.Msi`,
    ]);
  });

  test('drops what a side read as administrator once the helper stops, saying so and asking again rather than showing it as current', async () => {
    const stopped = Promise.withResolvers<void>();
    const helper: ElevatedFileSystem = {
      list: () => Promise.resolve([file('secret.txt')]),
      drives: () => Promise.resolve([]),
      watch: () => () => {},
      closed: stopped.promise,
      close: () => stopped.resolve(),
    };
    const { tool, page, send, notices } = commander(
      {
        [root]: [folder('Config.Msi')],
        [at('Config.Msi')]: Object.assign(new Error('denied'), {
          code: 'EPERM',
        }),
      },
      [],
      () => Promise.resolve(helper),
    );
    await tool.show(page, tab);
    await send({ type: 'open', tab: '1', side: 'left', name: 'Config.Msi' });
    await send({ type: 'elevate', tab: '1', side: 'left' });

    stopped.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const last = page.of('listing').at(-1);
    assert.deepStrictEqual(
      last && [last.side, last.folder, last.entries, last.elevated],
      ['left', at('Config.Msi'), [], false],
    );
    assert.deepStrictEqual(page.of('noAccess').at(-1), {
      type: 'noAccess',
      side: 'left',
      folder: at('Config.Msi'),
      asAdministrator: true,
    });
    assert.deepStrictEqual(notices, [
      { level: 'error', message: strings.commander.helperStopped },
    ]);
  });

  test('stays where it was when the user says no to running as administrator, and offers it only where it can', async () => {
    const listed: Record<string, Listed> = {
      [root]: [folder('Config.Msi')],
      [at('Config.Msi')]: Object.assign(new Error('denied'), { code: 'EPERM' }),
    };
    const refused = commander(listed, [], () => Promise.resolve(undefined));
    await refused.tool.show(refused.page, tab);
    await refused.send({
      type: 'open',
      tab: '1',
      side: 'left',
      name: 'Config.Msi',
    });
    await refused.send({ type: 'elevate', tab: '1', side: 'left' });
    assert.deepStrictEqual(refused.page.listings().slice(2), [
      `left ${root}: Config.Msi`,
    ]);

    const unable = commander(listed);
    unable.tool.ready(unable.page);
    assert.strictEqual(unable.page.of('settings').at(-1)?.canElevate, false);
  });

  test('says why in a notice when a folder can’t be opened for another reason', async () => {
    const { tool, page, send, notices } = commander({
      [root]: [folder('busy')],
      [at('busy')]: Object.assign(new Error('the device is busy'), {
        code: 'EBUSY',
      }),
    });
    await tool.show(page, tab);

    await send({ type: 'open', tab: '1', side: 'left', name: 'busy' });

    assert.deepStrictEqual(notices, [
      {
        level: 'error',
        message: strings.commander.couldNotOpen(
          at('busy'),
          'the device is busy',
        ),
      },
    ]);
    assert.deepStrictEqual(page.of('noAccess'), []);
  });

  test('shows the folder opened last on a side, when an earlier one is listed after it', async () => {
    const slow = Promise.withResolvers<readonly Entry[]>();
    const { tool, page, send } = commander({
      [root]: [folder('slow'), folder('fast')],
      [at('slow')]: slow.promise,
      [at('fast')]: [file('fast.txt')],
    });
    await tool.show(page, tab);

    const first = send({ type: 'open', tab: '1', side: 'left', name: 'slow' });
    await send({ type: 'open', tab: '1', side: 'left', name: 'fast' });
    slow.resolve([file('slow.txt')]);
    await first;

    assert.deepStrictEqual(page.listings().slice(2), [
      `left ${at('fast')} ↑: fast.txt`,
    ]);
  });

  test('changes the drive of a side only to a drive there is', async () => {
    const backup = at('backup');
    const { tool, page, send } = commander(
      { [root]: [], [backup]: [file('backup.zip')] },
      [root, backup],
    );
    await tool.show(page, tab);

    await send({ type: 'drive', tab: '1', side: 'right', drive: at('gone') });
    await send({ type: 'drive', tab: '1', side: 'right', drive: backup });

    assert.deepStrictEqual(page.listings().slice(2), [
      `right ${backup} ↑: backup.zip`,
    ]);
  });

  test('serves the icon of a file a side lists, and nothing else, as folders keep the icon of the app', async () => {
    const { tool, page, iconsLoaded } = commander({
      [root]: [folder('Users'), file('notes.txt')],
    });
    await tool.show(page, tab);
    const icon = async (query: Record<string, string>) => {
      const response = await tool.icon(
        new URL(
          `fastforward://app${iconUrl({ tab: '1', side: 'left', folder: root, name: 'notes.txt', ...query })}`,
        ),
      );
      return response.ok
        ? [response.headers.get('content-type'), await response.text()]
        : response.status;
    };

    assert.deepStrictEqual(await icon({}), [
      'image/png',
      `icon of ${at('notes.txt')}`,
    ]);
    assert.strictEqual(await icon({ name: 'Users' }), 404);
    assert.strictEqual(await icon({ name: '..' }), 404);
    assert.strictEqual(await icon({ name: 'secret.txt' }), 404);
    assert.strictEqual(await icon({ folder: at('Users') }), 404);
    assert.strictEqual(await icon({ tab: '2' }), 404);
    assert.strictEqual(await icon({ side: 'middle' }), 404);
    assert.deepStrictEqual(iconsLoaded, [at('notes.txt')]);
  });

  test('loads no icon for a row the page dropped before its icon came, taking only tickets it can read', async () => {
    const { tool, page, send, iconsLoaded } = commander({
      [root]: [file('a.zip'), file('b.txt'), file('c.md')],
    });
    await tool.show(page, tab);
    const icon = async (name: string, ticket: string) =>
      (
        await tool.icon(
          new URL(
            `fastforward://app${iconUrl({ tab: '1', side: 'left', folder: root, name }, ticket)}`,
          ),
        )
      ).status;

    await send({ type: 'dropIcons', tickets: ['7'] });
    await send(forged('{ "type": "dropIcons", "tickets": [8] }'));
    await send(forged('{ "type": "dropIcons", "tickets": "9" }'));

    assert.strictEqual(await icon('a.zip', '7'), 404);
    assert.strictEqual(await icon('b.txt', '8'), 200);
    assert.strictEqual(await icon('c.md', '9'), 200);
    assert.deepStrictEqual(iconsLoaded, [at('b.txt'), at('c.md')]);
  });

  test('saves the order of the side whose header was clicked, or whose files are grouped by color, keeping the other, and tells the page', async () => {
    const { tool, page, send, saved } = commander({});
    tool.ready(page);

    await send({
      type: 'sort',
      side: 'right',
      sort: { column: 'size', descending: true, groupByColor: true },
    });
    await send(
      forged(
        '{ "type": "sort", "side": "right", "sort": { "column": "owner", "descending": true, "groupByColor": false } }',
      ),
    );
    await send(
      forged(
        '{ "type": "sort", "side": "right", "sort": { "column": "size", "descending": "yes", "groupByColor": false } }',
      ),
    );
    await send(
      forged(
        '{ "type": "sort", "side": "right", "sort": { "column": "size", "descending": true, "groupByColor": "yes" } }',
      ),
    );
    await send(
      forged(
        '{ "type": "sort", "side": "middle", "sort": { "column": "size", "descending": true, "groupByColor": false } }',
      ),
    );

    const sorted: Sorts = {
      left: defaultSorts.left,
      right: { column: 'size', descending: true, groupByColor: true },
    };
    assert.deepStrictEqual(saved, [sorted]);
    assert.deepStrictEqual(page.of('settings').at(-1)?.sort, sorted);
  });

  test('tells the page the size of the thumbnails, and saves no layout, which each tab keeps for itself', async () => {
    const { tool, page, send, saved } = commander({});
    tool.ready(page);
    assert.strictEqual(page.of('settings').at(-1)?.thumbnailSize, 144);
    const told = page.of('settings').length;

    await send(
      forged('{ "type": "layout", "side": "right", "layout": "thumbnails" }'),
    );

    assert.deepStrictEqual(saved, []);
    assert.strictEqual(page.of('settings').length, told);
  });

  test('lists the drives again when asked, as drives come and go', async () => {
    const { page, send } = commander({}, ['C:\\']);

    await send({ type: 'listDrives' });

    assert.deepStrictEqual(page.of('drives'), [
      { type: 'drives', drives: ['C:\\'] },
    ]);
  });

  test('bookmarks the folder a side shows, saving it after the bookmarks written before, and tells the page the bookmarks it can open, sorted, but none for a folder the side doesn’t show or one bookmarked already', async () => {
    const work = at('work');
    const { tool, page, send, saved, settings } = commander({
      [root]: [folder('work')],
      [work]: [],
    });
    settings.bookmarks = [at('zeta'), 'Downloads'];
    tool.ready(page);
    await tool.show(page, tab);
    await send({ type: 'open', tab: '1', side: 'right', name: 'work' });

    await send({ type: 'addBookmark', tab: '1', side: 'right', folder: work });
    await send({ type: 'addBookmark', tab: '1', side: 'right', folder: work });
    await send({ type: 'addBookmark', tab: '1', side: 'left', folder: work });
    await send({ type: 'addBookmark', tab: '2', side: 'right', folder: work });
    await send(
      forged(
        `{ "type": "addBookmark", "tab": "1", "side": "middle", "folder": ${JSON.stringify(work)} }`,
      ),
    );

    assert.deepStrictEqual(saved, [[at('zeta'), 'Downloads', work]]);
    assert.deepStrictEqual(
      page.of('settings').map((each) => each.bookmarks),
      [[at('zeta')], [work, at('zeta')]],
    );
  });

  test('removes a bookmark however it was written, keeping the others as written, and tells the page, saving nothing for a folder not bookmarked', async () => {
    const { tool, page, send, saved, settings } = commander({});
    settings.bookmarks = [at('work'), at('zeta'), 'Downloads'];
    tool.ready(page);

    await send({ type: 'removeBookmark', folder: at('work') });
    await send({ type: 'removeBookmark', folder: at('gone') });
    await send(forged('{ "type": "removeBookmark", "folder": 2 }'));

    assert.deepStrictEqual(saved, [[at('zeta'), 'Downloads']]);
    assert.deepStrictEqual(
      page.of('settings').map((each) => each.bookmarks),
      [[at('work'), at('zeta')], [at('zeta')]],
    );
  });

  test('goes to a bookmark on the side asked as to any other folder, back again through its history, only to a folder bookmarked, saying why one can’t be opened', async () => {
    const work = at('work');
    const { tool, page, send, settings, notices } = commander({
      [root]: [folder('work')],
      [work]: [file('a.txt')],
    });
    settings.bookmarks = [work, at('gone')];
    await tool.show(page, tab);

    await send({ type: 'goToBookmark', tab: '1', side: 'left', folder: root });
    await send({ type: 'goToBookmark', tab: '2', side: 'left', folder: work });
    await send({ type: 'goToBookmark', tab: '1', side: 'left', folder: work });
    await send({ type: 'step', tab: '1', side: 'left', step: -1 });
    await send({
      type: 'goToBookmark',
      tab: '1',
      side: 'right',
      folder: at('gone'),
    });

    assert.deepStrictEqual(page.listings().slice(2), [
      `left ${work} ↑: a.txt`,
      `left ${root}: work [work]`,
      `right ${root}: work`,
    ]);
    assert.deepStrictEqual(notices, [
      {
        level: 'error',
        message: strings.commander.couldNotOpen(
          at('gone'),
          strings.commander.gone,
        ),
      },
    ]);
  });

  test('saves whether the hidden files are shown, and tells the page', async () => {
    const { tool, page, send, saved } = commander({});
    tool.ready(page);

    await send({ type: 'showHidden', shown: false });
    await send(forged('{ "type": "showHidden", "shown": "no" }'));

    assert.deepStrictEqual(saved, [false]);
    assert.deepStrictEqual(
      page.of('settings').map((each) => each.showHidden),
      [true, false],
    );
  });

  test('saves the widths of the columns the page resized, whole and within bounds, and tells the page with the defaults', async () => {
    const { tool, page, send, saved } = commander({});
    tool.ready(page);

    await send({
      type: 'columns',
      columns: { extension: 6, size: 12, date: 16 },
    });
    await send(
      forged(
        '{ "type": "columns", "columns": { "extension": 0, "size": 12, "date": 16 } }',
      ),
    );
    await send(
      forged(
        '{ "type": "columns", "columns": { "extension": 6.5, "size": 12, "date": 16 } }',
      ),
    );
    await send(
      forged(
        '{ "type": "columns", "columns": { "extension": 6, "size": 12 } }',
      ),
    );
    await send(
      forged(
        '{ "type": "columns", "columns": { "extension": 6, "size": 12, "date": 16, "name": 40 } }',
      ),
    );

    assert.deepStrictEqual(saved, [
      { extension: 6, size: 12, date: 16 },
      { extension: 6, size: 12, date: 16 },
    ]);
    assert.deepStrictEqual(page.of('settings').at(-1), {
      type: 'settings',
      showHidden: true,
      sort: defaultSorts,
      columns: { extension: 6, size: 12, date: 16 },
      defaultColumns,
      canElevate: false,
      platform: 'linux',
      thumbnailSize: 144,
      fileColors: [],
      bookmarks: [],
    });
  });

  test('forgets the folders of a closed tab, starting it at the root again', async () => {
    const { tool, page, send } = commander({
      [root]: [folder('Users')],
      [at('Users')]: [],
    });
    await tool.show(page, tab);
    await send({ type: 'open', tab: '1', side: 'left', name: 'Users' });

    tool.closed(page, tab);
    await tool.show(page, tab);

    assert.deepStrictEqual(page.listings().slice(3), [
      `left ${root}: Users`,
      `right ${root}: Users`,
    ]);
  });
});

const under = (...names: string[]) =>
  names.map((name) => `${name}${path.sep}`).join('');
const downloads = at('Downloads');
const inDownloads = (...names: string[]) => path.join(downloads, ...names);

const tree = (): Record<string, Listed> => ({
  [root]: [folder('Downloads')],
  [downloads]: [file('setup.exe'), folder('photos')],
  [inDownloads('photos')]: [file('cat.jpg'), folder('2024')],
  [inDownloads('photos', '2024')]: [file('dog.jpg')],
});

const flatFiles = (page: CommanderPage, from = 0) =>
  page
    .of('flatFiles')
    .slice(from)
    .flatMap((message) =>
      message.folders.map(
        (each) =>
          `${message.side} ${message.walk} ${each.under || '.'}: ${each.entries.map((entry) => entry.name).join(' ')}`,
      ),
    )
    .toSorted();

const progressOf = (page: CommanderPage) =>
  page.of('flatFiles').at(-1)?.progress;

const readAll = (page: CommanderPage) =>
  waitFor(
    () => progressOf(page)?.reading === false,
    'the reading of the folders',
  );

async function flatDownloads(listed: Record<string, Listed> = tree()) {
  const made = commander(listed);
  await made.tool.show(made.page, tab);
  await made.send({
    type: 'open',
    tab: '1',
    side: 'right',
    name: 'Downloads',
  });
  await made.send({ type: 'flat', tab: '1', side: 'right', flat: true });
  await readAll(made.page);
  return made;
}

suite('Commander tool in flat view', () => {
  test('lists the files of every folder under the folder of the side once asked, telling how far it read', async () => {
    const { page } = await flatDownloads();

    const listing = page.of('listing').at(-1);
    assert.strictEqual(listing?.flat, 1);
    assert.strictEqual(listing.folder, downloads);
    assert.deepStrictEqual(listing.entries, []);
    assert.deepStrictEqual(flatFiles(page), [
      'right 1 .: setup.exe',
      `right 1 ${under('photos', '2024')}: dog.jpg`,
      `right 1 ${under('photos')}: cat.jpg`,
    ]);
    assert.deepStrictEqual(progressOf(page), {
      reading: false,
      stopped: false,
      folders: 3,
      failed: 0,
    });
  });

  test('copies a file by its path under the folder of the side into the folder of the other side', async () => {
    const { send, transfers } = await flatDownloads();
    const name = `${under('photos', '2024')}dog.jpg`;

    await send({
      type: 'transfer',
      tab: '1',
      side: 'right',
      names: [name, 'setup.exe'],
      target: root,
      move: false,
    });

    assert.deepStrictEqual(plansOf(transfers), [
      {
        sources: [inDownloads(name), inDownloads('setup.exe')],
        target: root,
        move: false,
      },
    ]);
  });

  test('opens, views, compares and draws the icon of a file by its path under the folder of the side', async () => {
    const { tool, page, send, opened, viewed, compared, iconsLoaded } =
      await flatDownloads();
    const name = `${under('photos', '2024')}dog.jpg`;

    await send({ type: 'open', tab: '1', side: 'right', name });
    await send({ type: 'view', tab: '1', side: 'right', name });
    await send({
      type: 'compare',
      tab: '1',
      files: [
        { side: 'right', folder: downloads, name },
        { side: 'right', folder: downloads, name: 'setup.exe' },
      ],
    });
    const icon = await tool.icon(
      new URL(
        `fastforward://app${iconUrl({ tab: '1', side: 'right', folder: downloads, name })}`,
      ),
    );

    const dog = inDownloads('photos', '2024', 'dog.jpg');
    assert.deepStrictEqual(opened, [dog]);
    assert.deepStrictEqual(viewed, [dog]);
    assert.deepStrictEqual(
      compared.map((each) => [each.old, each.new]),
      [[dog, inDownloads('setup.exe')]],
    );
    assert.strictEqual(icon.status, 200);
    assert.deepStrictEqual(iconsLoaded, [dog]);
    assert.deepStrictEqual(page.of('listing').at(-1)?.flat, 1);
  });

  test('opens nothing that is not a file it read', async () => {
    const { send, opened, viewed } = await flatDownloads();

    await send({ type: 'open', tab: '1', side: 'right', name: 'photos' });
    await send({ type: 'open', tab: '1', side: 'right', name: 'cat.jpg' });
    await send({
      type: 'view',
      tab: '1',
      side: 'right',
      name: under('photos'),
    });

    assert.deepStrictEqual(opened, []);
    assert.deepStrictEqual(viewed, []);
  });

  test('turns off when asked, listing the folder of the side again', async () => {
    const { page, send, watchedTrees } = await flatDownloads();

    await send({ type: 'flat', tab: '1', side: 'right', flat: false });

    assert.deepStrictEqual(
      page.listings().at(-1),
      `right ${downloads} ↑: setup.exe photos`,
    );
    assert.strictEqual(page.of('listing').at(-1)?.flat, undefined);
    assert.deepStrictEqual(watchedTrees(), []);
  });

  test('ends once the side shows another folder, and not once it shows its own again', async () => {
    const { tool, page, send, watchedTrees } = await flatDownloads();

    await tool.show(page, tab);
    assert.strictEqual(
      page.of('listing').findLast((listing) => listing.side === 'right')?.flat,
      1,
    );

    await send({ type: 'open', tab: '1', side: 'right', name: '..' });
    assert.deepStrictEqual(
      page.listings().at(-1),
      `right ${root}: Downloads [Downloads]`,
    );
    assert.strictEqual(page.of('listing').at(-1)?.flat, undefined);
    assert.deepStrictEqual(watchedTrees(), []);

    await send({ type: 'open', tab: '1', side: 'right', name: 'Downloads' });
    assert.strictEqual(page.of('listing').at(-1)?.flat, undefined);
  });

  test('stops reading when asked, keeping what it read', async () => {
    const held = Promise.withResolvers<readonly Entry[]>();
    const listed = { ...tree(), [inDownloads('photos')]: held.promise };
    const { tool, page, send } = commander(listed);
    await tool.show(page, tab);
    await send({ type: 'open', tab: '1', side: 'right', name: 'Downloads' });
    await send({ type: 'flat', tab: '1', side: 'right', flat: true });
    await waitFor(() => flatFiles(page).length > 0, 'the first folder');

    await send({ type: 'stopReading', tab: '1', side: 'right' });
    held.resolve([file('cat.jpg')]);
    await readAll(page);

    assert.deepStrictEqual(flatFiles(page), ['right 1 .: setup.exe']);
    assert.deepStrictEqual(progressOf(page), {
      reading: false,
      stopped: true,
      folders: 1,
      failed: 0,
    });
  });

  test('reads the folders again from the start when asked to read the side again', async () => {
    const { page, send } = await flatDownloads();
    const before = page.of('flatFiles').length;

    await send({ type: 'reread', tab: '1', side: 'right' });
    await waitFor(
      () =>
        page.of('flatFiles').slice(before).at(-1)?.progress.reading === false,
      'the reading again',
    );

    assert.strictEqual(page.of('listing').at(-1)?.flat, 2);
    assert.deepStrictEqual(flatFiles(page, before), [
      'right 2 .: setup.exe',
      `right 2 ${under('photos', '2024')}: dog.jpg`,
      `right 2 ${under('photos')}: cat.jpg`,
    ]);
  });

  test('watches the folder of the side with the folders in it, reading again only the folder of what changed', async () => {
    const listed = tree();
    const { page, watched, watchedTrees, changeTree } =
      await flatDownloads(listed);
    const before = page.of('flatFiles').length;

    listed[inDownloads('photos')] = [
      file('cat.jpg'),
      file('new.jpg'),
      folder('2024'),
    ];
    changeTree(downloads, path.join('photos', 'new.jpg'));
    await waitFor(() => flatFiles(page, before).length > 0, 'the change');

    assert.deepStrictEqual(watched(), [root]);
    assert.deepStrictEqual(watchedTrees(), [downloads]);
    assert.deepStrictEqual(flatFiles(page, before), [
      `right 1 ${under('photos')}: cat.jpg new.jpg`,
    ]);
  });

  test('reads every folder again once the system cannot say what changed', async () => {
    const listed = tree();
    const { page, changeTree } = await flatDownloads(listed);
    const before = page.of('flatFiles').length;

    listed[inDownloads('photos', '2024')] = [file('dog.jpg'), file('owl.jpg')];
    changeTree(downloads, undefined);
    await waitFor(
      () => flatFiles(page, before).length === 3,
      'the folders read again',
    );

    assert.deepStrictEqual(flatFiles(page, before), [
      'right 1 .: setup.exe',
      `right 1 ${under('photos', '2024')}: dog.jpg owl.jpg`,
      `right 1 ${under('photos')}: cat.jpg`,
    ]);
  });

  test('keeps what changes while hidden for the page until shown again, and tells it all once it loads again', async () => {
    const listed = tree();
    const { tool, page, changeTree } = await flatDownloads(listed);
    tool.hide(page);
    const before = page.of('flatFiles').length;

    listed[downloads] = [
      file('setup.exe'),
      file('later.exe'),
      folder('photos'),
    ];
    changeTree(downloads, 'later.exe');
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.strictEqual(page.of('flatFiles').length, before);

    await tool.show(page, tab);
    await waitFor(() => flatFiles(page, before).length > 0, 'what changed');
    assert.deepStrictEqual(flatFiles(page, before), [
      'right 1 .: setup.exe later.exe',
    ]);

    const loaded = page.of('flatFiles').length;
    tool.ready(page);
    await tool.show(page, tab);
    await waitFor(() => flatFiles(page, loaded).length === 3, 'every folder');
    assert.deepStrictEqual(flatFiles(page, loaded), [
      'right 1 .: setup.exe later.exe',
      `right 1 ${under('photos', '2024')}: dog.jpg`,
      `right 1 ${under('photos')}: cat.jpg`,
    ]);
  });

  test('deletes files of the folders under the side, reading their folders again', async () => {
    const listed = tree();
    const { page, send, trashed } = await flatDownloads(listed);
    const before = page.of('flatFiles').length;
    listed[inDownloads('photos', '2024')] = [];

    await send({
      type: 'delete',
      tab: '1',
      side: 'right',
      names: [`${under('photos', '2024')}dog.jpg`],
      permanently: false,
    });
    await waitFor(
      () => flatFiles(page, before).length > 0,
      'the folder read again',
    );

    assert.deepStrictEqual(trashed, [inDownloads('photos', '2024', 'dog.jpg')]);
    assert.deepStrictEqual(flatFiles(page, before), [
      `right 1 ${under('photos', '2024')}: `,
    ]);
  });

  test('shows the menu of Windows for files of one folder, and says it cannot for files of several', async () => {
    const { send, menus, notices } = await flatDownloads();
    const menu = (names: string[]) =>
      send({
        type: 'shellMenu',
        tab: '1',
        side: 'right',
        names,
        x: 1,
        y: 2,
        extended: false,
      });

    await menu([`${under('photos')}cat.jpg`]);
    await menu(['setup.exe', `${under('photos')}cat.jpg`]);

    assert.deepStrictEqual(
      menus.map((each) => each.files),
      [[inDownloads('photos', 'cat.jpg')]],
    );
    assert.deepStrictEqual(notices, [
      { level: 'error', message: strings.commander.menuOfOneFolder },
    ]);
  });

  test('opens the folder of a file on the other side, selecting the file', async () => {
    const { page, send } = await flatDownloads();

    await send({
      type: 'openOnSide',
      tab: '1',
      from: 'right',
      side: 'left',
      name: `${under('photos', '2024')}dog.jpg`,
    });

    assert.deepStrictEqual(
      page.listings().at(-1),
      `left ${inDownloads('photos', '2024')} ↑: dog.jpg [dog.jpg]`,
    );
  });

  test('stops reading and watching once its tab is closed', async () => {
    const { tool, page, watchedTrees } = await flatDownloads();

    tool.closed(page, tab);

    assert.deepStrictEqual(watchedTrees(), []);
  });

  test('is not turned on or off by a forged message', async () => {
    const { tool, page, send } = commander(tree());
    await tool.show(page, tab);

    await send(
      forged('{ "type": "flat", "tab": "1", "side": "right", "flat": "yes" }'),
    );
    await send(
      forged('{ "type": "flat", "tab": "1", "side": "middle", "flat": true }'),
    );

    assert.ok(
      page.of('listing').every((listing) => listing.flat === undefined),
    );
  });
});

const sizeOf = (entry: Entry) =>
  `${entry.size ?? 'no size'}${entry.counting === true ? ' counting' : ''}${entry.unreadFolders === undefined ? '' : `, ${entry.unreadFolders} unread`}`;

const sizesTold = (page: CommanderPage) =>
  page
    .of('folderSizes')
    .flatMap((message) =>
      message.entries.map(
        (entry) =>
          `${message.side} ${message.folder} ${entry.name}: ${sizeOf(entry)}`,
      ),
    );

const sizesListed = (page: CommanderPage) =>
  page
    .of('listing')
    .at(-1)
    ?.entries.filter((entry) => entry.folder)
    .map((entry) => `${entry.name}: ${sizeOf(entry)}`);

const counted = (page: CommanderPage, told: string) =>
  waitFor(() => sizesTold(page).at(-1) === told, told);

const sizedTree = (): Record<string, Listed> => ({
  [root]: [folder('Downloads')],
  [downloads]: [file('setup.exe'), folder('photos'), folder('music')],
  [inDownloads('photos')]: [file('cat.jpg'), folder('2024')],
  [inDownloads('photos', '2024')]: [file('dog.jpg')],
  [inDownloads('music')]: [file('song.mp3')],
});

async function inDownloadsFolder(listed: Record<string, Listed> = sizedTree()) {
  const made = commander(listed);
  await made.tool.show(made.page, tab);
  await made.send({ type: 'open', tab: '1', side: 'right', name: 'Downloads' });
  return made;
}

suite('Commander tool counting the sizes of folders', () => {
  test('counts the size of the folders asked for that a side lists, telling the page, and lists them with their sizes after', async () => {
    const { tool, page, send } = await inDownloadsFolder();

    await send({
      type: 'countSizes',
      tab: '1',
      side: 'right',
      names: ['photos'],
    });
    await counted(page, `right ${downloads} photos: 2`);

    await tool.show(page, tab);
    assert.deepStrictEqual(sizesListed(page), ['photos: 2', 'music: no size']);
  });

  test('tells the size counted so far while it counts, and how many folders under it could not be read', async () => {
    const held = Promise.withResolvers<readonly Entry[]>();
    const { page, send } = await inDownloadsFolder({
      ...sizedTree(),
      [inDownloads('photos')]: [
        file('cat.jpg'),
        folder('2024'),
        folder('locked'),
      ],
      [inDownloads('photos', '2024')]: held.promise,
      [inDownloads('photos', 'locked')]: Object.assign(new Error('denied'), {
        code: 'EPERM',
      }),
    });

    await send({
      type: 'countSizes',
      tab: '1',
      side: 'right',
      names: ['photos'],
    });
    await counted(page, `right ${downloads} photos: 1 counting, 1 unread`);
    held.resolve([file('dog.jpg')]);

    await counted(page, `right ${downloads} photos: 2, 1 unread`);
  });

  test('counts each folder asked for', async () => {
    const { page, send } = await inDownloadsFolder();

    await send({
      type: 'countSizes',
      tab: '1',
      side: 'right',
      names: ['photos', 'music'],
    });

    await waitFor(
      () =>
        sizesTold(page).includes(`right ${downloads} photos: 2`) &&
        sizesTold(page).includes(`right ${downloads} music: 1`),
      'both sizes',
    );
  });

  test('counts nothing a side does not list as a folder, in a folder it does not show, listed flat, or for a forged message', async () => {
    const { page, send, settled } = await inDownloadsFolder();

    for (const names of [['setup.exe'], ['nowhere'], ['..'], []]) {
      await send({ type: 'countSizes', tab: '1', side: 'right', names });
    }
    await send({
      type: 'countSizes',
      tab: '1',
      side: 'right',
      folder: root,
      names: ['photos'],
    });
    await send({
      type: 'countSizes',
      tab: '2',
      side: 'right',
      names: ['photos'],
    });
    await send(
      forged(
        `{ "type": "countSizes", "tab": "1", "side": "right", "folder": ${JSON.stringify(downloads)}, "names": "photos" }`,
      ),
    );
    await send(
      forged(
        `{ "type": "countSizes", "tab": "1", "side": "right", "folder": ${JSON.stringify(downloads)}, "names": [1] }`,
      ),
    );
    await send({ type: 'flat', tab: '1', side: 'right', flat: true });
    await send({
      type: 'countSizes',
      tab: '1',
      side: 'right',
      names: ['photos'],
    });
    await settled();
    await new Promise((resolve) => setTimeout(resolve, 150));

    assert.deepStrictEqual(sizesTold(page), []);
  });

  test('keeps the sizes while the folder of the side changes, and forgets them once it reads its folder again or shows another', async () => {
    const { page, send, change } = await inDownloadsFolder();
    const countPhotos = () =>
      send({ type: 'countSizes', tab: '1', side: 'right', names: ['photos'] });

    await countPhotos();
    await counted(page, `right ${downloads} photos: 2`);
    await change(downloads);
    await waitFor(
      () =>
        page.of('listing').length > 0 && sizesListed(page)?.[0] === 'photos: 2',
      'the listing after the change',
    );

    await send({ type: 'reread', tab: '1', side: 'right' });
    assert.deepStrictEqual(sizesListed(page), [
      'photos: no size',
      'music: no size',
    ]);

    await countPhotos();
    await waitFor(() => sizesTold(page).length === 2, 'the size counted again');
    await send({ type: 'open', tab: '1', side: 'right', name: '..' });
    await send({ type: 'open', tab: '1', side: 'right', name: 'Downloads' });
    assert.deepStrictEqual(sizesListed(page), [
      'photos: no size',
      'music: no size',
    ]);
  });

  test('stops counting when asked, telling the page the folders it was counting have no size', async () => {
    const held = Promise.withResolvers<readonly Entry[]>();
    const { page, send, settled } = await inDownloadsFolder({
      ...sizedTree(),
      [inDownloads('photos', '2024')]: held.promise,
    });

    await send({
      type: 'countSizes',
      tab: '1',
      side: 'right',
      names: ['photos'],
    });
    await counted(page, `right ${downloads} photos: 1 counting`);
    await send({ type: 'stopReading', tab: '1', side: 'right' });
    await counted(page, `right ${downloads} photos: no size`);
    held.resolve([file('dog.jpg')]);
    await settled();
    await new Promise((resolve) => setTimeout(resolve, 150));

    assert.strictEqual(
      sizesTold(page).at(-1),
      `right ${downloads} photos: no size`,
    );
  });

  test('counts through the walker the app gives it, and through the helper on a side read as administrator', async () => {
    const listed: Record<string, Listed> = {
      ...sizedTree(),
      [root]: [folder('Downloads'), folder('Config.Msi')],
      [at('Config.Msi')]: Object.assign(new Error('denied'), {
        code: 'EPERM',
      }),
      [at('Config.Msi', 'sub')]: Object.assign(new Error('denied'), {
        code: 'EPERM',
      }),
    };
    const helper: ElevatedFileSystem = {
      list: (each) =>
        Promise.resolve(
          each === at('Config.Msi') ? [folder('sub')] : [file('x.txt')],
        ),
      drives: () => Promise.resolve([]),
      watch: () => () => {},
      closed: new Promise(() => {}),
      close: () => {},
    };
    const { tool, page, send, counting } = commander(listed, [], () =>
      Promise.resolve(helper),
    );
    const walks: SizeWalk[] = [];
    counting.walker = {
      walk: (walk) => {
        walks.push(walk);
        return Promise.resolve({
          bytes: 5,
          unread: 0,
          unreadable: false,
          rest: [],
        });
      },
    };
    await tool.show(page, tab);
    tool.ready(page);
    await send({ type: 'open', tab: '1', side: 'right', name: 'Downloads' });
    await send({ type: 'open', tab: '1', side: 'left', name: 'Config.Msi' });
    await send({ type: 'elevate', tab: '1', side: 'left' });

    await send({
      type: 'countSizes',
      tab: '1',
      side: 'right',
      names: ['photos'],
    });
    await counted(page, `right ${downloads} photos: 5`);
    await send({ type: 'countSizes', tab: '1', side: 'left', names: ['sub'] });
    await counted(page, `left ${at('Config.Msi')} sub: 1`);

    assert.deepStrictEqual(walks, [
      { folders: [inDownloads('photos')], asked: true },
    ]);
  });

  test('reads nothing more once its tab is closed', async () => {
    const held = Promise.withResolvers<readonly Entry[]>();
    const read: string[] = [];
    const listed = new Proxy(
      {
        ...sizedTree(),
        [inDownloads('photos')]: held.promise,
      },
      {
        get(target, key, receiver) {
          if (typeof key === 'string') {
            read.push(key);
          }
          return Reflect.get(target, key, receiver);
        },
      },
    );
    const { tool, page, send, settled } = await inDownloadsFolder(listed);

    await send({
      type: 'countSizes',
      tab: '1',
      side: 'right',
      names: ['photos'],
    });
    await waitFor(
      () => read.includes(inDownloads('photos')),
      'the folder counted',
    );
    tool.closed(page, tab);
    held.resolve([file('cat.jpg'), folder('2024')]);
    await settled();
    await new Promise((resolve) => setTimeout(resolve, 50));

    assert.ok(!read.includes(inDownloads('photos', '2024')));
  });
});

suite('The folder to select', () => {
  test('is the child of a folder on the way to the one left, and none for a folder elsewhere', () => {
    assert.strictEqual(childToward(root, at('Users', 'me')), 'Users');
    assert.strictEqual(childToward(at('Users'), at('Users', 'me')), 'me');
    assert.strictEqual(childToward(at('Users'), at('Users')), undefined);
    assert.strictEqual(childToward(at('Users', 'me'), at('Users')), undefined);
    assert.strictEqual(childToward(at('Users'), at('Windows')), undefined);
  });
});

suite('The root', () => {
  test('is the system drive on Windows, and / elsewhere', () => {
    assert.strictEqual(rootFolder('win32', { SystemDrive: 'D:' }), 'D:\\');
    assert.strictEqual(rootFolder('win32', {}), 'C:\\');
    assert.strictEqual(rootFolder('darwin', { SystemDrive: 'D:' }), '/');
    assert.strictEqual(rootFolder('linux', {}), '/');
  });
});

const archiveItem = (itemPath: string): ArchiveItem => ({
  path: itemPath,
  folder: false,
  size: 1,
  modified: 0,
  hiddenAttribute: false,
  link: false,
  encrypted: false,
});

const zipped = [
  archiveItem('docs/readme.md'),
  archiveItem('docs/deep/notes.md'),
  archiveItem('top.txt'),
];

suite('Commander tool in archives', () => {
  test('enters an archive the page asks to, listing it as a folder by a path through the archive, going into its folders and out again with .., selecting where it came from', async () => {
    const { tool, page, send, archived } = commander({
      [root]: [file('a.zip'), file('notes.txt')],
    });
    archived.set(at('a.zip'), zipped);
    await tool.show(page, tab);

    await send({
      type: 'enterArchive',
      tab: '1',
      side: 'right',
      name: 'a.zip',
    });
    await send({ type: 'open', tab: '1', side: 'right', name: 'docs' });
    await send({ type: 'open', tab: '1', side: 'right', name: '..' });
    await send({ type: 'open', tab: '1', side: 'right', name: '..' });

    assert.deepStrictEqual(page.listings().slice(2), [
      `right ${at('a.zip')} ↑: docs top.txt`,
      `right ${at('a.zip', 'docs')} ↑: readme.md deep`,
      `right ${at('a.zip')} ↑: docs top.txt [docs]`,
      `right ${root}: a.zip notes.txt [a.zip]`,
    ]);
    assert.deepStrictEqual(
      page
        .of('listing')
        .slice(2)
        .map((listing) => listing.archive),
      [at('a.zip'), at('a.zip'), at('a.zip'), undefined],
    );
  });

  test('says why a file could not be entered as an archive, staying where it was, and enters nothing a side does not list or a folder', async () => {
    const { tool, page, send, notices, archived } = commander({
      [root]: [file('a.zip'), file('notes.txt'), folder('Users')],
    });
    archived.set(at('a.zip'), [archiveItem('inner.zip')]);
    archived.set(at('a.zip', 'inner.zip'), zipped);
    await tool.show(page, tab);

    await send({
      type: 'enterArchive',
      tab: '1',
      side: 'right',
      name: 'notes.txt',
    });
    assert.deepStrictEqual(notices, [
      {
        level: 'error',
        message: strings.commander.notArchive(
          'notes.txt',
          'Cannot open the file as archive',
        ),
      },
    ]);
    for (const name of ['gone.zip', 'Users', '..']) {
      await send({ type: 'enterArchive', tab: '1', side: 'right', name });
    }
    await send({
      type: 'enterArchive',
      tab: '1',
      side: 'right',
      name: 'a.zip',
    });

    assert.strictEqual(notices.length, 1);
    assert.deepStrictEqual(page.listings().slice(2), [
      `right ${at('a.zip')} ↑: inner.zip`,
    ]);
  });

  test('enters an archive inside an archive from the menu or on a side, by a path through both, leaving it with .. for the archive around it', async () => {
    const { tool, page, send, archived } = commander({
      [root]: [file('a.zip')],
    });
    archived.set(at('a.zip'), [
      archiveItem('inner.zip'),
      archiveItem('top.txt'),
    ]);
    archived.set(at('a.zip', 'inner.zip'), zipped);
    await tool.show(page, tab);

    for (const name of ['a.zip', 'inner.zip']) {
      await send({ type: 'enterArchive', tab: '1', side: 'right', name });
    }
    await send({ type: 'open', tab: '1', side: 'right', name: 'docs' });
    await send({ type: 'open', tab: '1', side: 'right', name: '..' });
    await send({ type: 'open', tab: '1', side: 'right', name: '..' });
    await send({
      type: 'openOnSide',
      tab: '1',
      from: 'right',
      side: 'left',
      name: 'inner.zip',
    });

    assert.deepStrictEqual(page.listings().slice(2), [
      `right ${at('a.zip')} ↑: inner.zip top.txt`,
      `right ${at('a.zip', 'inner.zip')} ↑: docs top.txt`,
      `right ${at('a.zip', 'inner.zip', 'docs')} ↑: readme.md deep`,
      `right ${at('a.zip', 'inner.zip')} ↑: docs top.txt [docs]`,
      `right ${at('a.zip')} ↑: inner.zip top.txt [inner.zip]`,
      `left ${at('a.zip', 'inner.zip')} ↑: docs top.txt`,
    ]);
  });

  test('lists a folder inside an archive inside another it has not opened, opening both on the way, as a side comes back there after a restart', async () => {
    const state = new FakeStore();
    await state.update('sides', {
      1: { right: at('a.zip', 'inner.zip', 'docs') },
    });
    const { tool, page, archived } = commander(
      { [root]: [file('a.zip')] },
      [],
      undefined,
      state,
    );
    archived.set(at('a.zip'), [archiveItem('inner.zip')]);
    archived.set(at('a.zip', 'inner.zip'), zipped);

    await tool.show(page, tab);

    assert.deepStrictEqual(
      page.listings().filter((listing) => listing.startsWith('right')),
      [`right ${at('a.zip', 'inner.zip', 'docs')} ↑: readme.md deep`],
    );
  });

  test('enters on a side an archive the other side has selected, shows there the folder of a file 7-Zip sees no archive in, as before, and says why an archive it could not open was not entered, staying where it was', async () => {
    const { tool, page, send, archived, notices } = commander({
      [root]: [file('a.zip'), file('broken.zip'), file('notes.txt')],
    });
    archived.set(at('a.zip'), zipped);
    archived.set(at('broken.zip'), 'Unexpected end of archive');
    await tool.show(page, tab);

    for (const name of ['a.zip', 'notes.txt', 'broken.zip']) {
      await send({
        type: 'openOnSide',
        tab: '1',
        from: 'left',
        side: 'right',
        name,
      });
    }
    await send({
      type: 'openOnSide',
      tab: '1',
      from: 'left',
      side: 'left',
      name: 'a.zip',
    });

    assert.deepStrictEqual(page.listings().slice(2), [
      `right ${at('a.zip')} ↑: docs top.txt`,
      `right ${root}: a.zip broken.zip notes.txt [a.zip]`,
      `left ${at('a.zip')} ↑: docs top.txt`,
    ]);
    assert.deepStrictEqual(notices, [
      {
        level: 'error',
        message: strings.commander.notArchive(
          'broken.zip',
          'Unexpected end of archive',
        ),
      },
    ]);
  });

  test('lists a folder inside an archive it has not opened, going through the archive the path runs through, as a side comes back there after a restart', async () => {
    const state = new FakeStore();
    await state.update('sides', { 1: { right: at('a.zip', 'docs') } });
    const { tool, page, archived } = commander(
      { [root]: [file('a.zip')] },
      [],
      undefined,
      state,
    );
    archived.set(at('a.zip'), zipped);

    await tool.show(page, tab);

    assert.deepStrictEqual(
      page.listings().filter((listing) => listing.startsWith('right')),
      [`right ${at('a.zip', 'docs')} ↑: readme.md deep`],
    );
  });

  test('watches the archive a side is inside, listing it again once it changes, and goes to the nearest folder still there once the folder shown is gone from it', async () => {
    const { tool, page, send, watched, change, archived } = commander({
      [root]: [file('a.zip')],
    });
    archived.set(at('a.zip'), zipped);
    await tool.show(page, tab);
    await send({
      type: 'enterArchive',
      tab: '1',
      side: 'right',
      name: 'a.zip',
    });
    await send({ type: 'open', tab: '1', side: 'right', name: 'docs' });
    await send({ type: 'open', tab: '1', side: 'right', name: 'deep' });
    assert.deepStrictEqual(watched(), [root, at('a.zip')].toSorted());

    archived.set(at('a.zip'), [...zipped, archiveItem('docs/deep/more.md')]);
    await change(at('a.zip'));
    assert.strictEqual(
      page.listings().at(-1),
      `right ${at('a.zip', 'docs', 'deep')} ↑: notes.md more.md`,
    );

    archived.set(at('a.zip'), [archiveItem('docs/readme.md')]);
    await change(at('a.zip'));
    await waitFor(
      () =>
        page.listings().at(-1) ===
        `right ${at('a.zip', 'docs')} ↑: readme.md [deep]`,
      'the folder inside the archive still there',
    );
  });

  test('does nothing inside an archive it cannot do there, nor drags out of it', async () => {
    const { tool, page, send, notices, archived, ...done } = commander({
      [root]: [file('a.zip'), file('notes.txt')],
    });
    archived.set(at('a.zip'), zipped);
    await tool.show(page, tab);
    await send({
      type: 'enterArchive',
      tab: '1',
      side: 'right',
      name: 'a.zip',
    });
    const inside = { tab: '1', side: 'right' } as const;

    await send({
      ...inside,
      type: 'delete',
      names: ['top.txt'],
      permanently: false,
    });
    await send({
      type: 'transfer',
      tab: '1',
      side: 'left',
      names: ['notes.txt'],
      target: at('a.zip'),
      move: true,
    });
    await send({ ...inside, type: 'newFolder', name: 'made' });
    await send({ ...inside, type: 'paste' });
    await send({ ...inside, type: 'drag', names: ['top.txt'] });
    await send({
      ...inside,
      type: 'shellMenu',
      names: ['top.txt'],
      x: 1,
      y: 1,
      extended: false,
    });
    await send({
      ...inside,
      type: 'folderCommand',
      name: 'docs',
      command: 'newTerminal',
    });
    await send({ ...inside, type: 'addBookmark', folder: at('a.zip') });
    await tool.dropped(page, [at('notes.txt')], {
      type: 'drop',
      tab: '1',
      side: 'right',
      folder: at('a.zip'),
      move: false,
    });

    assert.deepStrictEqual(notices, []);
    assert.deepStrictEqual(
      {
        trashed: done.trashed,
        transfers: done.transfers.length,
        madeFolders: done.madeFolders,
        clipboard: done.clipboard.files,
        dragged: done.dragged,
        menus: done.menus,
        openedIn: done.openedIn,
        bookmarks: done.settings.bookmarks,
        viewed: done.viewed,
        opened: done.opened,
        compared: done.compared,
        watchedTrees: done.watchedTrees(),
      },
      {
        trashed: [],
        transfers: 0,
        madeFolders: [],
        clipboard: [],
        dragged: [],
        menus: [],
        openedIn: [],
        bookmarks: [],
        viewed: [],
        opened: [],
        compared: [],
        watchedTrees: [],
      },
    );
  });

  suite('reading its files', () => {
    let copiesFolder: string;

    beforeEach(() => {
      copiesFolder = tempFolder('archive-copies');
    });

    afterEach(() => {
      for (const copy of fs.readdirSync(copiesFolder, {
        recursive: true,
        encoding: 'utf8',
      })) {
        fs.chmodSync(path.join(copiesFolder, copy), 0o777);
      }
      removeFolder(copiesFolder);
    });

    const inArchive = async () => {
      const made = commander({ [root]: [file('a.zip'), file('notes.txt')] });
      made.archived.set(at('a.zip'), zipped);
      made.copies.folder = copiesFolder;
      await made.tool.show(made.page, tab);
      await made.send({
        type: 'enterArchive',
        tab: '1',
        side: 'right',
        name: 'a.zip',
      });
      return made;
    };

    test('removes the copy a viewer tab showed once the tab is closed, unless another open tab still shows it, and nothing outside the copies of viewed files', async () => {
      const { tool, page, tabs, settled } = await inArchive();
      const copyIn = (named: string) => {
        const copy = path.join(copiesFolder, 'viewed', named, 'a.txt');
        fs.mkdirSync(path.dirname(copy), { recursive: true });
        fs.writeFileSync(copy, 'a');
        return copy;
      };
      const closedAlone = copyIn('alone');
      const shared = copyIn('shared');
      const outside = path.join(copiesFolder, 'outside.txt');
      fs.writeFileSync(outside, 'o');
      tabs.push({ id: '9', tool: 'commander', view: true, root: shared });

      for (const [id, viewedFile] of [
        ['6', closedAlone],
        ['7', shared],
        ['8', outside],
      ] as const) {
        tool.closed(page, {
          id,
          tool: 'commander',
          view: true,
          root: viewedFile,
        });
      }
      await settled();

      assert.ok(!fs.existsSync(path.dirname(closedAlone)));
      assert.ok(fs.existsSync(shared));
      assert.ok(fs.existsSync(outside));
    });

    test('views a file of an archive from a copy kept with the copies of viewed files, named as the file is', async () => {
      const { send, viewed } = await inArchive();
      await send({ type: 'view', tab: '1', side: 'right', name: 'top.txt' });

      const [copy] = viewed;
      assert.ok(copy !== undefined);
      assert.strictEqual(path.basename(copy), 'top.txt');
      assert.strictEqual(
        path.relative(path.join(copiesFolder, 'viewed'), copy).split(path.sep)
          .length,
        2,
      );
      assert.strictEqual(
        fs.readFileSync(copy, 'utf8'),
        'the top.txt of the archive',
      );
    });

    test('opens a file of an archive in the app the system opens it with from a copy, asking once it is saved whether to put it back, putting it back in the dialog of copies once asked to, asking again once saved again and only while the commander is shown, and from a read-only copy for an archive that cannot be changed', async () => {
      const made = commander({ [root]: [file('a.zip')] });
      made.archived.set(at('a.zip'), [...zipped, archiveItem('inner.zip')]);
      made.archived.set(path.join(at('a.zip'), 'inner.zip'), zipped);
      made.copies.folder = copiesFolder;
      const { tool, page, send, opened, watched, change, notices } = made;
      await tool.show(page, tab);
      const opening = (name: string) =>
        send({ type: 'open', tab: '1', side: 'right', name });
      await send({
        type: 'enterArchive',
        tab: '1',
        side: 'right',
        name: 'a.zip',
      });
      await opening('docs');
      await opening('readme.md');

      const [copy] = opened;
      assert.ok(copy !== undefined);
      assert.strictEqual(path.basename(copy), 'readme.md');
      assert.strictEqual(
        fs.readFileSync(copy, 'utf8'),
        'the docs/readme.md of the archive',
      );
      assert.notStrictEqual(fs.statSync(copy).mode & 0o200, 0);
      const holding = path.dirname(copy);
      assert.ok(watched().includes(holding));
      const asked = () => page.of('askUpdate');
      const saved = async (content: string) => {
        fs.writeFileSync(copy, `${content} ${'.'.repeat(asked().length)}`);
        await Promise.all([change(holding), change(holding)]);
      };
      const name = path.join('docs', 'readme.md');

      await change(holding);
      assert.strictEqual(tool.quitNote(), undefined);
      await saved('Changed once.');
      await waitFor(() => asked().length === 1, 'the update to be asked');
      assert.strictEqual(tool.quitNote(), strings.commander.quitDropsChanges);
      await saved('Changed again before an answer.');
      await send({ type: 'updateArchive', ask: 1, update: true });
      await waitFor(() => notices.length === 1, 'the copy to be put back');
      assert.strictEqual(tool.quitNote(), undefined);
      assert.deepStrictEqual(asked(), [
        { type: 'askUpdate', ask: 1, name, archive: 'a.zip' },
      ]);
      assert.deepStrictEqual(made.changedInArchives, [
        ['add', at('a.zip'), ['docs'], holding, ['readme.md']],
      ]);
      assert.strictEqual(
        page
          .of('transfer')
          .find((message) => message.view?.archiveJob === 'update')?.view
          ?.target,
        at('a.zip'),
      );
      assert.deepStrictEqual(notices, [
        {
          level: 'info',
          message: strings.commander.putBack(
            strings.commander.oneItem('readme.md'),
            at('a.zip'),
          ),
        },
      ]);

      await saved('Changed once put back.');
      await waitFor(() => asked().length === 2, 'the update to be asked again');
      await send({ type: 'updateArchive', ask: 2, update: false });
      await made.settled();
      tool.hide(page);
      await saved('Changed while the commander is hidden.');
      await waitFor(
        () => tool.quitNote() === strings.commander.quitDropsChanges,
        'the change to wait for an answer while the commander is hidden',
      );
      assert.strictEqual(asked().length, 2);
      await tool.show(page, tab);
      await waitFor(() => asked().length === 3, 'the update to be asked');
      assert.strictEqual(made.changedInArchives.length, 1);

      await opening('..');
      await send({
        type: 'enterArchive',
        tab: '1',
        side: 'right',
        name: 'inner.zip',
      });
      await opening('top.txt');
      const fromInner = opened.at(-1);
      assert.ok(fromInner !== undefined && fromInner !== copy);
      assert.strictEqual(fs.statSync(fromInner).mode & 0o222, 0);
      assert.ok(!watched().includes(path.dirname(fromInner)));
    });

    test('puts a copy back where it was opened from, though the side went on to a folder with a file of its name while it was taken out', async () => {
      const made = commander({ [root]: [file('a.zip')] });
      made.archived.set(at('a.zip'), [
        archiveItem('docs/readme.md'),
        archiveItem('notes/readme.md'),
      ]);
      made.copies.folder = copiesFolder;
      const { tool, page, send, opened, change, extractsHeld } = made;
      await tool.show(page, tab);
      const opening = (name: string) =>
        send({ type: 'open', tab: '1', side: 'right', name });
      await send({
        type: 'enterArchive',
        tab: '1',
        side: 'right',
        name: 'a.zip',
      });
      await opening('docs');
      const held = Promise.withResolvers<void>();
      extractsHeld.until = held.promise;

      const readme = opening('readme.md');
      await opening('..');
      await opening('notes');
      held.resolve();
      await readme;
      const [copy] = opened;
      assert.ok(copy !== undefined);
      fs.writeFileSync(copy, 'Changed.');
      await change(path.dirname(copy));
      await waitFor(
        () => page.of('askUpdate').length === 1,
        'the update to be asked',
      );
      await send({ type: 'updateArchive', ask: 1, update: true });
      await waitFor(
        () => made.changedInArchives.length === 1,
        'the copy to be put back',
      );

      assert.strictEqual(
        page.of('askUpdate')[0]?.name,
        path.join('docs', 'readme.md'),
      );
      assert.deepStrictEqual(made.changedInArchives, [
        ['add', at('a.zip'), ['docs'], path.dirname(copy), ['readme.md']],
      ]);
    });

    test('compares a file of an archive with one on disk from a copy of it, the first named the old side', async () => {
      const { send, compared } = await inArchive();
      await send({
        type: 'compare',
        tab: '1',
        files: [
          { side: 'right', folder: at('a.zip'), name: 'top.txt' },
          { side: 'left', folder: root, name: 'notes.txt' },
        ],
      });

      const [comparing] = compared;
      assert.ok(comparing !== undefined);
      assert.strictEqual(
        fs.readFileSync(comparing.old, 'utf8'),
        'the top.txt of the archive',
      );
      assert.strictEqual(comparing.new, at('notes.txt'));
    });

    test('puts copies of the files and folders of an archive asked for on the clipboard, the folders whole', async () => {
      const { send, clipboard } = await inArchive();
      await send({
        type: 'copyToClipboard',
        tab: '1',
        side: 'right',
        names: ['docs', 'top.txt'],
      });

      assert.deepStrictEqual(
        clipboard.files.map((copy) => path.basename(copy)).toSorted(),
        ['docs', 'top.txt'],
      );
      const docs = clipboard.files.find(
        (copy) => path.basename(copy) === 'docs',
      );
      assert.ok(docs !== undefined);
      assert.ok(fs.existsSync(path.join(docs, 'deep', 'notes.md')));
    });

    test('copies the items asked for out of an archive into the folder of the other side, taking them out first and then moving them from there through a transfer, its popup naming the items of the archive', async () => {
      const { send, page, transfers } = await inArchive();
      await send({
        type: 'transfer',
        tab: '1',
        side: 'right',
        names: ['docs', 'top.txt'],
        target: root,
        move: false,
      });
      await waitFor(
        () => plansOf(transfers).length === 1,
        'the copy to start once the items are taken out',
      );

      const [moving] = plansOf(transfers);
      assert.ok(moving !== undefined);
      assert.deepStrictEqual(
        [
          moving.sources.map((source) => path.basename(source)).toSorted(),
          moving.target,
          moving.move,
        ],
        [['docs', 'top.txt'], root, true],
      );
      assert.ok(
        moving.sources.every((source) => source.startsWith(copiesFolder)),
      );
      assert.ok(
        fs.existsSync(
          path.join(path.dirname(moving.sources[0] ?? ''), 'docs', 'deep'),
        ),
      );
      const shown = page
        .of('transfer')
        .findLast((message) => message.view !== undefined)?.view;
      assert.deepStrictEqual(
        [shown?.move, shown?.items, shown?.target],
        [false, 2, root],
      );
    });

    test('moves the items asked for out of an archive into the folder of the other side, deleting them from the archive once the transfer moved them and reading it again, and moves nothing out of an archive inside another, saying it cannot be changed', async () => {
      const made = commander({ [root]: [file('a.zip')] });
      made.archived.set(at('a.zip'), [...zipped, archiveItem('inner.zip')]);
      made.archived.set(path.join(at('a.zip'), 'inner.zip'), zipped);
      made.copies.folder = copiesFolder;
      await made.tool.show(made.page, tab);
      const { send, page, transfers, removedFromArchives, notices } = made;
      await send({
        type: 'enterArchive',
        tab: '1',
        side: 'right',
        name: 'a.zip',
      });
      const listed = page.of('listing').length;
      const moving = (names: readonly string[]) =>
        send({
          type: 'transfer',
          tab: '1',
          side: 'right',
          names,
          target: root,
          move: true,
        });

      await moving(['docs', 'top.txt']);
      await waitFor(
        () => plansOf(transfers).length === 1,
        'the move to start once the items are taken out',
      );
      const shown = page
        .of('transfer')
        .findLast((message) => message.view !== undefined)?.view;
      assert.deepStrictEqual(
        [shown?.move, shown?.items, shown?.target],
        [true, 2, root],
      );
      for (const source of plansOf(transfers)[0]?.sources ?? []) {
        fs.rmSync(source, { recursive: true, force: true });
      }
      transfers[0]?.listener.event({ type: 'done', stopped: false });
      await waitFor(
        () => removedFromArchives.length === 1,
        'what was moved to be deleted from the archive',
      );
      await waitFor(
        () => page.of('listing').length > listed,
        'the archive to be read again',
      );
      await send({
        type: 'enterArchive',
        tab: '1',
        side: 'right',
        name: 'inner.zip',
      });
      await moving(['top.txt']);

      assert.deepStrictEqual(removedFromArchives, [
        [at('a.zip'), ['docs', 'top.txt']],
      ]);
      assert.deepStrictEqual(notices, [
        {
          level: 'error',
          message: strings.commander.archiveUnchangeable('inner.zip'),
        },
      ]);
      assert.strictEqual(plansOf(transfers).length, 1);
    });

    const betweenArchives = async () => {
      const made = commander({ [root]: [file('a.zip'), file('b.7z')] });
      made.archived.set(at('a.zip'), [
        ...zipped,
        archiveItem('docs/top.txt'),
        archiveItem('inner.zip'),
      ]);
      made.archived.set(path.join(at('a.zip'), 'inner.zip'), zipped);
      made.archived.set(at('b.7z'), [archiveItem('into/top.txt')]);
      made.copies.folder = copiesFolder;
      await made.tool.show(made.page, tab);
      const entering = (side: Side, name: string) =>
        made.send({ type: 'enterArchive', tab: '1', side, name });
      await entering('left', 'a.zip');
      await entering('right', 'b.7z');
      await made.send({ type: 'open', tab: '1', side: 'right', name: 'into' });
      const transfer = (
        names: readonly string[],
        move: boolean,
        {
          existing,
          from = at('a.zip'),
          target = path.join(at('b.7z'), 'into'),
        }: {
          readonly existing?: 'replace' | 'skip';
          readonly from?: string;
          readonly target?: string;
        } = {},
      ) =>
        made.send({
          type: 'transfer',
          tab: '1',
          side: 'left',
          folder: from,
          names,
          target,
          move,
          ...(existing !== undefined && { existing }),
        });
      const added = () =>
        made.changedInArchives.map((change) =>
          Array.isArray(change)
            ? [change[0], change[1], change[2], change[4]]
            : change,
        );
      return { ...made, entering, transfer, added };
    };

    test('copies and moves items from an archive on one side into the folder of an archive on the other, only with an answer about items there already, skipping or replacing them as answered, and deletes those of a move from the first once added', async () => {
      const { transfer, added, removedFromArchives, notices, page } =
        await betweenArchives();

      await transfer(['docs', 'top.txt'], false);
      await transfer(['docs', 'top.txt'], false, { existing: 'skip' });
      await waitFor(() => added().length === 1, 'the copy to be added');
      await transfer(['top.txt'], true, { existing: 'replace' });
      await waitFor(
        () => removedFromArchives.length === 1,
        'the moved item to be deleted from the first archive',
      );

      assert.deepStrictEqual(added(), [
        ['add', at('b.7z'), ['into'], ['docs']],
        ['add', at('b.7z'), ['into'], ['top.txt']],
      ]);
      assert.deepStrictEqual(removedFromArchives, [[at('a.zip'), ['top.txt']]]);
      const moving = page
        .of('transfer')
        .find((message) => message.view?.archiveJob === 'moveIn')?.view;
      assert.deepStrictEqual(
        [moving?.move, moving?.items, moving?.target],
        [true, 1, path.join(at('b.7z'), 'into')],
      );
      assert.deepStrictEqual(notices, []);
    });

    test('copies out of an archive inside another into an archive but moves nothing out of it, and refuses an item into itself or the folder it is in within one archive, and files of one name listed flat', async () => {
      const {
        send,
        entering,
        transfer,
        added,
        removedFromArchives,
        notices,
        page,
      } = await betweenArchives();
      const inner = path.join(at('a.zip'), 'inner.zip');
      await entering('left', 'inner.zip');

      await transfer(['top.txt'], true, { existing: 'replace', from: inner });
      await transfer(['docs'], false, { from: inner });
      await waitFor(() => added().length === 1, 'the copy to be added');
      await send({ type: 'open', tab: '1', side: 'left', name: '..' });
      await send({ type: 'open', tab: '1', side: 'right', name: '..' });
      await send({ type: 'open', tab: '1', side: 'right', name: '..' });
      await entering('right', 'a.zip');
      await send({ type: 'open', tab: '1', side: 'right', name: 'docs' });
      await transfer(['docs'], false, {
        target: path.join(at('a.zip'), 'docs'),
      });
      await send({ type: 'open', tab: '1', side: 'right', name: '..' });
      await transfer(['top.txt'], false, { target: at('a.zip') });
      await send({ type: 'flat', tab: '1', side: 'left', flat: true });
      await waitFor(
        () => page.of('flatFiles').length > 0,
        'the archive to be listed flat',
      );
      await send({ type: 'open', tab: '1', side: 'right', name: '..' });
      await entering('right', 'b.7z');
      await transfer(['top.txt', path.join('docs', 'top.txt')], false, {
        existing: 'replace',
        target: at('b.7z'),
      });

      assert.deepStrictEqual(added(), [
        ['add', at('b.7z'), ['into'], ['docs']],
      ]);
      assert.deepStrictEqual(removedFromArchives, []);
      assert.deepStrictEqual(notices, [
        {
          level: 'error',
          message: strings.commander.archiveUnchangeable('inner.zip'),
        },
        { level: 'error', message: strings.commander.intoItself('docs') },
        { level: 'error', message: strings.commander.alreadyIn(at('a.zip')) },
        { level: 'error', message: strings.commander.namesAlike('top.txt') },
      ]);
    });

    test('lists the files of every folder of an archive flat, watching the archive, and reads them and copies them out from copies taken out without their folders', async () => {
      const { send, page, viewed, transfers, watched } = await inArchive();
      await send({ type: 'flat', tab: '1', side: 'right', flat: true });
      const flatNames = () =>
        page
          .of('flatFiles')
          .flatMap((message) =>
            message.folders.flatMap((listed) =>
              listed.entries.map((entry) => `${listed.under}${entry.name}`),
            ),
          )
          .toSorted();
      const deep = ['docs', 'deep', 'notes.md'].join(path.sep);
      const readme = ['docs', 'readme.md'].join(path.sep);
      await waitFor(
        () => flatNames().length === 3,
        'the files of the archive listed flat',
      );
      assert.deepStrictEqual(flatNames(), [deep, readme, 'top.txt'].toSorted());
      assert.ok(watched().includes(at('a.zip')));

      await send({ type: 'view', tab: '1', side: 'right', name: deep });
      const [copy] = viewed;
      assert.ok(copy !== undefined);
      assert.strictEqual(
        fs.readFileSync(copy, 'utf8'),
        'the docs/deep/notes.md of the archive',
      );

      await send({
        type: 'transfer',
        tab: '1',
        side: 'right',
        names: [readme, 'top.txt'],
        target: root,
        move: false,
      });
      await waitFor(
        () => plansOf(transfers).length === 1,
        'the copy to start once the files are taken out',
      );
      const [moving] = plansOf(transfers);
      assert.deepStrictEqual(
        new Set(moving?.sources.map((source) => path.dirname(source))).size,
        1,
      );
      assert.deepStrictEqual(
        moving?.sources.map((source) => path.basename(source)).toSorted(),
        ['readme.md', 'top.txt'],
      );
    });

    test('asks for the password of an encrypted file before reading it, again when it was wrong, and reads nothing when none is given', async () => {
      const { page, send, notices, archived, secrets, viewed } =
        await inArchive();
      archived.set(at('a.zip'), [
        ...zipped,
        { ...archiveItem('secret.txt'), encrypted: true },
      ]);
      secrets.set(at('a.zip'), 'right');
      await send({ type: 'reread', tab: '1', side: 'right' });
      const asked = () => page.of('askPassword');
      const answer = (password?: string) =>
        send({
          type: 'password',
          ask: asked().at(-1)?.ask ?? 0,
          ...(password !== undefined && { password }),
        });

      const viewing = send({
        type: 'view',
        tab: '1',
        side: 'right',
        name: 'secret.txt',
      });
      await waitFor(() => asked().length === 1, 'the password to be asked');
      await answer('wrong');
      await waitFor(() => asked().length === 2, 'the password asked again');
      await answer('right');
      await viewing;
      assert.deepStrictEqual(
        asked().map(({ name, wrong }) => [name, wrong]),
        [
          ['a.zip', false],
          ['a.zip', true],
        ],
      );
      assert.strictEqual(path.basename(viewed[0] ?? ''), 'secret.txt');

      await send({ type: 'view', tab: '1', side: 'right', name: 'secret.txt' });
      assert.strictEqual(asked().length, 2);
      assert.strictEqual(viewed.length, 2);
      assert.deepStrictEqual(notices, []);
    });

    test('gives up an earlier question for a password once another is asked, as the page shows one at a time, ignoring a late answer to it', async () => {
      const { page, send, archived, secrets, viewed } = await inArchive();
      archived.set(at('a.zip'), [
        ...zipped,
        { ...archiveItem('secret.txt'), encrypted: true },
      ]);
      secrets.set(at('a.zip'), 'right');
      await send({ type: 'reread', tab: '1', side: 'right' });
      const asked = () => page.of('askPassword');
      const view = () =>
        send({ type: 'view', tab: '1', side: 'right', name: 'secret.txt' });

      const first = view();
      await waitFor(() => asked().length === 1, 'the first question');
      const second = view();
      await waitFor(() => asked().length === 2, 'the second question');
      await first;
      await send({
        type: 'password',
        ask: asked()[0]?.ask ?? 0,
        password: 'right',
      });
      assert.deepStrictEqual(viewed, []);
      await send({
        type: 'password',
        ask: asked()[1]?.ask ?? 0,
        password: 'right',
      });
      await second;
      assert.strictEqual(viewed.length, 1);
    });

    test('copies nothing out of an archive when the password of its encrypted files is not given, and says why nothing could be taken out of an archive', async () => {
      const {
        page,
        send,
        notices,
        archived,
        secrets,
        copies,
        opened,
        transfers,
      } = await inArchive();
      archived.set(at('a.zip'), [
        ...zipped,
        { ...archiveItem('docs/secret.txt'), encrypted: true },
      ]);
      secrets.set(at('a.zip'), 'right');
      await send({ type: 'reread', tab: '1', side: 'right' });

      const copying = send({
        type: 'transfer',
        tab: '1',
        side: 'right',
        names: ['docs'],
        target: root,
        move: false,
      });
      await waitFor(
        () => page.of('askPassword').length === 1,
        'the password to be asked for a folder holding an encrypted file',
      );
      await send({
        type: 'password',
        ask: page.of('askPassword')[0]?.ask ?? 0,
      });
      await copying;
      assert.strictEqual(transfers.length, 0);

      copies.refused = 'Data Error';
      await send({ type: 'open', tab: '1', side: 'right', name: 'top.txt' });
      assert.deepStrictEqual(notices, [
        {
          level: 'error',
          message: strings.commander.couldNotExtract('Data Error'),
        },
      ]);
      assert.deepStrictEqual(opened, []);
    });

    test('serves the images of an archive for their thumbnails from copies taken out of it together, each once, removing them once read, an encrypted one only once its password is known', async () => {
      const {
        tool,
        page,
        send,
        archived,
        copies,
        extracted,
        passwords,
        secrets,
        thumbnails,
      } = commander({ [root]: [file('a.zip')] });
      copies.folder = copiesFolder;
      archived.set(at('a.zip'), [
        ...zipped,
        archiveItem('a.png'),
        archiveItem('pics/b.png'),
        { ...archiveItem('secret.png'), encrypted: true },
      ]);
      secrets.set(at('a.zip'), 'right');
      await tool.show(page, tab);
      await send({
        type: 'enterArchive',
        tab: '1',
        side: 'right',
        name: 'a.zip',
      });
      await send({ type: 'flat', tab: '1', side: 'right', flat: true });
      await waitFor(
        () =>
          page
            .of('flatFiles')
            .some((message) =>
              message.folders.some((listed) =>
                listed.entries.some((entry) => entry.name === 'b.png'),
              ),
            ),
        'the image in a folder of the archive to be listed flat',
      );
      const before = fs.readdirSync(copiesFolder);
      const thumbnail = async (name: string) => {
        const response = await tool.thumbnail(
          new URL(
            `fastforward://app${thumbnailUrl({ tab: '1', side: 'right', folder: at('a.zip'), name }, '1:0')}`,
          ),
        );
        return response.ok
          ? [response.headers.get('content-type'), await response.text()]
          : response.status;
      };

      assert.deepStrictEqual(
        await Promise.all(
          ['a.png', path.join('pics', 'b.png'), 'a.png'].map(thumbnail),
        ),
        [
          ['image/png', 'the a.png of the archive'],
          ['image/png', 'the pics/b.png of the archive'],
          ['image/png', 'the a.png of the archive'],
        ],
      );
      assert.strictEqual(await thumbnail('secret.png'), 404);
      assert.strictEqual(await thumbnail('top.txt'), 404);
      assert.deepStrictEqual(extracted, [['a.png', 'pics/b.png']]);
      const webp = new Uint8Array(Buffer.from('RIFF    WEBPVP8 made'));
      const keyOf = (name: string) =>
        thumbnailKey(path.join(at('a.zip'), name), 1, 0, 144, 1.5);
      for (const name of ['a.png', 'secret.png']) {
        await send({
          type: 'saveThumbnail',
          tab: '1',
          side: 'right',
          folder: at('a.zip'),
          name,
          box: 144,
          pixelRatio: 1.5,
          bytes: webp,
        });
      }
      assert.deepStrictEqual([...thumbnails.keys()], [keyOf('a.png')]);
      thumbnails.set(keyOf('secret.png'), webp);
      const cached = await tool.thumbnail(
        new URL(
          `fastforward://app${thumbnailUrl({ tab: '1', side: 'right', folder: at('a.zip'), name: 'secret.png' }, '1:0')}&box=144&ratio=1.5`,
        ),
      );
      assert.strictEqual(cached.status, 404);
      passwords.set(at('a.zip'), 'right');
      assert.deepStrictEqual(await thumbnail('secret.png'), [
        'image/png',
        'the secret.png of the archive',
      ]);
      assert.deepStrictEqual(fs.readdirSync(copiesFolder), before);
    });

    test('makes no thumbnail in the background of an image in an archive kept online only, as reading it would download the archive, asking about the archive rather than a path inside it', async () => {
      const { tool, page, send, archived, streamed } = commander({
        [root]: [file('a.zip'), file('nested.zip')],
      });
      archived.set(at('a.zip'), [archiveItem('a.png')]);
      await tool.show(page, tab);
      await send({
        type: 'enterArchive',
        tab: '1',
        side: 'right',
        name: 'a.zip',
      });
      streamed.add(at('a.zip'));
      const filled = async () => {
        const response = await tool.thumbnail(
          new URL(
            `fastforward://app${filledThumbnailUrl(boxedThumbnailUrl(thumbnailUrl({ tab: '1', side: 'right', folder: at('a.zip'), name: 'a.png' }, '1:0'), 144, 1.5))}`,
          ),
        );
        await response.body?.cancel();
        return response.status;
      };
      assert.strictEqual(await filled(), 409);
      streamed.clear();
      streamed.add(path.join(at('a.zip'), 'a.png'));
      assert.notStrictEqual(await filled(), 409);
    });
  });

  test('asks for the password of an archive whose names are encrypted, entering it once given, asking again when it was wrong, and stays where it was when none is given', async () => {
    const { tool, page, send, archived, secrets, notices } = commander({
      [root]: [file('a.zip')],
    });
    archived.set(at('a.zip'), zipped);
    secrets.set(at('a.zip'), 'right');
    await tool.show(page, tab);
    const asked = () => page.of('askPassword');
    const answer = (password?: string) =>
      send({
        type: 'password',
        ask: asked().at(-1)?.ask ?? 0,
        ...(password !== undefined && { password }),
      });

    const cancelled = send({
      type: 'enterArchive',
      tab: '1',
      side: 'right',
      name: 'a.zip',
    });
    await waitFor(() => asked().length === 1, 'the password to be asked');
    await answer();
    await cancelled;
    assert.strictEqual(page.listings().length, 2);

    const entering = send({
      type: 'enterArchive',
      tab: '1',
      side: 'right',
      name: 'a.zip',
    });
    await waitFor(() => asked().length === 2, 'the password asked again');
    await answer('wrong');
    await waitFor(() => asked().length === 3, 'the password asked once more');
    await answer('right');
    await entering;

    assert.deepStrictEqual(
      asked().map(({ name, wrong }) => [name, wrong]),
      [
        ['a.zip', false],
        ['a.zip', false],
        ['a.zip', true],
      ],
    );
    assert.strictEqual(
      page.listings().at(-1),
      `right ${at('a.zip')} ↑: docs top.txt`,
    );
    assert.deepStrictEqual(notices, []);
  });

  test('deletes the items of an archive asked for from it in the dialog of copies, reading it again once done, and says an archive inside another cannot be changed yet', async () => {
    const { tool, page, send, archived, removedFromArchives, notices } =
      commander({ [root]: [file('a.zip')] });
    archived.set(at('a.zip'), [...zipped, archiveItem('inner.zip')]);
    archived.set(path.join(at('a.zip'), 'inner.zip'), zipped);
    await tool.show(page, tab);
    await send({
      type: 'enterArchive',
      tab: '1',
      side: 'right',
      name: 'a.zip',
    });
    const listed = page.of('listing').length;
    const deleting = (inFolder: string, names: readonly string[]) =>
      send({
        type: 'delete',
        tab: '1',
        side: 'right',
        folder: inFolder,
        names,
        permanently: true,
      });

    await deleting(at('a.zip'), ['docs', 'top.txt', 'missing.txt']);
    await deleting(at('a.zip'), ['docs', 'top.txt']);
    await waitFor(
      () => page.of('listing').length > listed,
      'the archive to be read again',
    );
    assert.deepStrictEqual(
      page
        .of('transfer')
        .find((message) => message.view?.archiveJob === 'delete')?.view,
      {
        id: 1,
        move: false,
        archiveJob: 'delete',
        items: 2,
        target: at('a.zip'),
        stopping: false,
      },
    );
    await send({
      type: 'enterArchive',
      tab: '1',
      side: 'right',
      name: 'inner.zip',
    });
    await deleting(path.join(at('a.zip'), 'inner.zip'), ['top.txt']);

    assert.deepStrictEqual(removedFromArchives, [
      [at('a.zip'), ['docs', 'top.txt']],
    ]);
    assert.deepStrictEqual(notices, [
      {
        level: 'error',
        message: strings.commander.archiveUnchangeable('inner.zip'),
      },
    ]);
  });

  test('renames an item of an archive and makes a folder in it in the dialog of copies, selecting it once read again, and refuses a name the folder of the archive has', async () => {
    const { tool, page, send, archived, changedInArchives, notices } =
      commander({ [root]: [file('a.zip')] });
    archived.set(at('a.zip'), zipped);
    await tool.show(page, tab);
    await send({
      type: 'enterArchive',
      tab: '1',
      side: 'right',
      name: 'a.zip',
    });
    const archive = at('a.zip');
    const selectedOnceListed = (name: string) =>
      waitFor(
        () => page.of('listing').at(-1)?.selected === name,
        `${name} to be selected`,
      );

    await send({
      type: 'rename',
      tab: '1',
      side: 'right',
      folder: archive,
      name: 'top.txt',
      to: 'docs',
    });
    await send({
      type: 'newFolder',
      tab: '1',
      side: 'right',
      folder: archive,
      name: 'top.txt',
    });
    await send({
      type: 'rename',
      tab: '1',
      side: 'right',
      folder: archive,
      name: 'top.txt',
      to: 'bottom.txt',
    });
    await selectedOnceListed('bottom.txt');
    await send({
      type: 'newFolder',
      tab: '1',
      side: 'right',
      folder: archive,
      name: 'fresh',
    });
    await selectedOnceListed('fresh');

    assert.deepStrictEqual(changedInArchives, [
      ['rename', at('a.zip'), 'top.txt', 'bottom.txt'],
      ['folder', at('a.zip'), [], 'fresh'],
    ]);
    assert.deepStrictEqual(notices, [
      { level: 'error', message: strings.commander.nameTaken('docs') },
      { level: 'error', message: strings.commander.nameTaken('top.txt') },
    ]);
  });

  test('copies and moves items into the folder of an archive on the other side, only with an answer about items there already, skipping or replacing them as answered, deleting the originals of a move once packed, and not the archive into itself', async () => {
    const { tool, page, send, archived, changedInArchives, removed, notices } =
      commander({
        [root]: [
          file('a.zip'),
          file('top.txt'),
          file('new.txt'),
          file('locked.txt'),
        ],
      });
    archived.set(at('a.zip'), zipped);
    await tool.show(page, tab);
    await send({ type: 'enterArchive', tab: '1', side: 'left', name: 'a.zip' });
    const transfer = (
      names: string[],
      move: boolean,
      existing?: 'replace' | 'skip',
    ) =>
      send({
        type: 'transfer',
        tab: '1',
        side: 'right',
        folder: root,
        names,
        target: at('a.zip'),
        move,
        ...(existing !== undefined && { existing }),
      });
    const added = (count: number) =>
      waitFor(
        () => changedInArchives.length === count,
        `${count} additions to the archive`,
      );

    await transfer(['top.txt', 'new.txt'], false);
    await transfer(['a.zip'], false);
    await transfer(['top.txt', 'new.txt'], false, 'skip');
    await added(1);
    await transfer(['top.txt', 'new.txt'], false, 'replace');
    await added(2);
    await transfer(['new.txt', 'locked.txt'], true);
    await waitFor(() => notices.length === 2, 'the move to end');

    assert.deepStrictEqual(changedInArchives, [
      ['add', at('a.zip'), [], root, ['new.txt']],
      ['add', at('a.zip'), [], root, ['top.txt', 'new.txt']],
      ['add', at('a.zip'), [], root, ['new.txt', 'locked.txt']],
    ]);
    assert.deepStrictEqual(removed, [at('new.txt'), at('locked.txt')]);
    assert.deepStrictEqual(
      page
        .of('transfer')
        .find((message) => message.view?.archiveJob === 'moveIn')?.view,
      {
        id: 3,
        move: true,
        archiveJob: 'moveIn',
        items: 2,
        target: at('a.zip'),
        stopping: false,
      },
    );
    assert.deepStrictEqual(notices, [
      { level: 'error', message: strings.commander.intoItself('a.zip') },
      {
        level: 'error',
        message: strings.commander.movedWithout(
          'a.zip',
          'locked.txt: It is in use',
        ),
      },
    ]);
  });

  test('refuses files of one name listed flat into an archive, as only one of them could go into its folder', async () => {
    const { tool, page, send, archived, changedInArchives, notices } =
      commander({
        [root]: [file('a.zip'), folder('one'), folder('two')],
        [at('one')]: [file('same.txt')],
        [at('two')]: [file('same.txt'), file('other.txt')],
      });
    archived.set(at('a.zip'), zipped);
    await tool.show(page, tab);
    await send({ type: 'enterArchive', tab: '1', side: 'left', name: 'a.zip' });
    await send({ type: 'flat', tab: '1', side: 'right', flat: true });
    await waitFor(
      () =>
        page
          .of('flatFiles')
          .flatMap((message) => message.folders)
          .flatMap((listed) => listed.entries).length === 4,
      'the files to be listed flat',
    );

    for (const move of [false, true]) {
      await send({
        type: 'transfer',
        tab: '1',
        side: 'right',
        folder: root,
        names: [
          path.join('one', 'same.txt'),
          path.join('two', 'other.txt'),
          path.join('two', 'same.txt'),
        ],
        target: at('a.zip'),
        move,
      });
    }

    assert.deepStrictEqual(changedInArchives, []);
    assert.deepStrictEqual(notices, [
      { level: 'error', message: strings.commander.namesAlike('same.txt') },
      { level: 'error', message: strings.commander.namesAlike('same.txt') },
    ]);
  });

  test('stays inside an archive read again once changed while its watch tells of the change, the refresh waiting for that reading rather than stopping it', async () => {
    const {
      tool,
      page,
      send,
      archived,
      opensHeld,
      change,
      removedFromArchives,
      settled,
    } = commander({ [root]: [file('a.zip')] });
    archived.set(at('a.zip'), zipped);
    await tool.show(page, tab);
    await send({
      type: 'enterArchive',
      tab: '1',
      side: 'right',
      name: 'a.zip',
    });
    const { promise: held, resolve: release } = Promise.withResolvers();
    opensHeld.until = held;

    await send({
      type: 'delete',
      tab: '1',
      side: 'right',
      folder: at('a.zip'),
      names: ['top.txt'],
      permanently: true,
    });
    await waitFor(
      () => page.of('readingArchive').length === 1,
      'the archive to be read again once changed',
    );
    await change(at('a.zip'));
    release(undefined);
    await settled();

    assert.deepStrictEqual(removedFromArchives, [[at('a.zip'), ['top.txt']]]);
    assert.strictEqual(lastFolder(page, '1', 'right'), at('a.zip'));
  });

  test('tells the page a side is reading an archive once it takes a while, stopping on Esc and staying where it was', async () => {
    const { tool, page, send, archived, opensHeld, notices } = commander({
      [root]: [file('a.zip')],
    });
    archived.set(at('a.zip'), zipped);
    await tool.show(page, tab);
    opensHeld.until = new Promise(() => {});

    const entering = send({
      type: 'enterArchive',
      tab: '1',
      side: 'right',
      name: 'a.zip',
    });
    await waitFor(
      () => page.of('readingArchive').length === 1,
      'the page to be told the archive is being read',
    );
    await send({ type: 'stopReading', tab: '1', side: 'right' });
    await entering;

    assert.deepStrictEqual(page.of('readingArchive'), [
      { type: 'readingArchive', tab: '1', side: 'right', name: 'a.zip' },
      { type: 'readingArchive', tab: '1', side: 'right' },
    ]);
    assert.strictEqual(page.listings().length, 2);
    assert.deepStrictEqual(notices, []);
  });

  test('shows the folder of an archive with it selected when the reading of it is stopped for a side coming back inside it', async () => {
    const state = new FakeStore();
    await state.update('sides', { 1: { right: at('a.zip', 'docs') } });
    const { tool, page, send, archived, opensHeld } = commander(
      { [root]: [file('a.zip')] },
      [],
      undefined,
      state,
    );
    archived.set(at('a.zip'), zipped);
    opensHeld.until = new Promise(() => {});

    const showing = tool.show(page, tab);
    await waitFor(
      () => page.of('readingArchive').length === 1,
      'the page to be told the archive is being read',
    );
    opensHeld.until = undefined;
    await send({ type: 'stopReading', tab: '1', side: 'right' });
    await showing;

    assert.deepStrictEqual(
      page.listings().filter((listing) => listing.startsWith('right')),
      [`right ${root}: a.zip [a.zip]`],
    );
  });

  test('gives the folder holding the archive as the folder of the tab while its active side is inside the archive', async () => {
    const { tool, page, send, archived } = commander({
      [root]: [file('a.zip')],
    });
    archived.set(at('a.zip'), zipped);
    await tool.show(page, tab);
    await send({
      type: 'enterArchive',
      tab: '1',
      side: 'right',
      name: 'a.zip',
    });
    await send({ type: 'open', tab: '1', side: 'right', name: 'docs' });

    assert.strictEqual(tool.folderOf(tab), root);
  });
});

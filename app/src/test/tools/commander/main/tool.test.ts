import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import type { Notice, Page, Tab } from '../../../../shell/main/shell';
import type { Compared } from '../../../../shell/main/storage';
import type { ToWebview } from '../../../../shell/shared/protocol';
import type { FileSystem } from '../../../../tools/commander/main/fileSystem';
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
  viewerIconUrl,
} from '../../../../tools/commander/shared/icons';
import type { ElevatedFileSystem } from '../../../../tools/commander/main/elevated';
import {
  maxBytesAsked,
  maxColoredBytes,
} from '../../../../tools/commander/shared/protocol';
import { strings } from '../../../../shared/strings';
import { maxImageSize } from '../../../../shared/images';
import { viewedFileUrl } from '../../../../tools/commander/shared/files';
import type { PdfPlace } from '../../../../shared/pdf';
import { removeFolder, tempFolder } from '../../../repositories';
import { waitFor } from '../../../fixtures';

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

function commander(
  listed: Record<string, Listed>,
  drives: readonly string[] = [],
  elevate?: () => Promise<ElevatedFileSystem | undefined>,
) {
  const notices: Notice[] = [];
  const saved: unknown[] = [];
  const watching: { folder: string; changed: () => void }[] = [];
  const iconsLoaded: string[] = [];
  const settings = {
    showHidden: true,
    sort: defaultSorts,
    columns: defaultColumns,
  };
  const fileSystem: FileSystem = {
    list: (each) => {
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
    realPath: (link) =>
      link === at('Documents and Settings')
        ? Promise.resolve(at('Users'))
        : Promise.resolve(link),
    watch: (watched, changed) => {
      const watch = { folder: watched, changed };
      watching.push(watch);
      return () => watching.splice(watching.indexOf(watch), 1);
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
    setRoot: () => {},
    visited: () => {},
    recentItems: () => 10,
    postTabs: () => {},
    notice: (_page, notice) => notices.push(notice),
    track: (tracked) => tracked,
    idle: () => Promise.resolve(),
  });
  const send = (message: CommanderToHost, from: Page = page) =>
    tool.receive(from, message);
  const watched = () => watching.map((watch) => watch.folder).toSorted();
  const change = async (changed: string) => {
    for (const watch of watching.filter((each) => each.folder === changed)) {
      watch.changed();
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  return {
    tool,
    page,
    send,
    notices,
    saved,
    watched,
    change,
    iconsLoaded,
    viewed,
    compared,
    tabs,
  };
}

const tab: Tab = { id: '1', tool: 'commander' };

const defaultColumns: ColumnWidths = { extension: 10, size: 15, date: 16 };

const defaultSorts: Sorts = {
  left: { column: 'extension', descending: false },
  right: { column: 'extension', descending: false },
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
        { type: 'viewing', tab: '3', size: 19, binary: false },
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
          ...bad,
        });
      }
      await send(
        forged(
          '{ "type": "readRows", "tab": "3", "encoding": "ebcdic", "request": 8, "anchor": 0, "exact": true, "before": 0, "after": 1 }',
        ),
      );
      assert.strictEqual(page.of('rows').length, 1);
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

    test('reads the rows and the whole text of a file viewed in the encoding asked for, and tells of the encoding its byte order mark names', async () => {
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
      assert.strictEqual(page.of('text').at(-1)?.text, 'one\ntwo\n');
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

  test('opens on a side the folder selected on the other, its parent for .., or the folder the other is in for a file', async () => {
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
      `left ${root}: Users notes.txt [Users]`,
      `right ${root}: Users notes.txt [Users]`,
      `left ${root}: Users notes.txt`,
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
          { side: one[0], name: one[1] },
          { side: other[0], name: other[1] },
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

  test('saves the order of the side whose header was clicked, keeping the other, and tells the page', async () => {
    const { tool, page, send, saved } = commander({});
    tool.ready(page);

    await send({
      type: 'sort',
      side: 'right',
      sort: { column: 'size', descending: true },
    });
    await send(
      forged(
        '{ "type": "sort", "side": "right", "sort": { "column": "owner", "descending": true } }',
      ),
    );
    await send(
      forged(
        '{ "type": "sort", "side": "right", "sort": { "column": "size", "descending": "yes" } }',
      ),
    );
    await send(
      forged(
        '{ "type": "sort", "side": "middle", "sort": { "column": "size", "descending": true } }',
      ),
    );

    const sorted: Sorts = {
      left: defaultSorts.left,
      right: { column: 'size', descending: true },
    };
    assert.deepStrictEqual(saved, [sorted]);
    assert.deepStrictEqual(page.of('settings').at(-1)?.sort, sorted);
  });

  test('lists the drives again when asked, as drives come and go', async () => {
    const { page, send } = commander({}, ['C:\\']);

    await send({ type: 'listDrives' });

    assert.deepStrictEqual(page.of('drives'), [
      { type: 'drives', drives: ['C:\\'] },
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

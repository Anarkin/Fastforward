import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import type { Tab } from '../../../../shell/main/shell';
import {
  thumbnailUrl,
  iconUrl,
  viewerIconUrl,
} from '../../../../tools/commander/shared/icons';
import {
  boxedThumbnailUrl,
  filledThumbnailUrl,
  madeThumbnailHeader,
  maxImageSize,
  maxThumbnailBytes,
} from '../../../../shared/images';
import { thumbnailKey } from '../../../../tools/commander/main/thumbnailStore';
import { viewedFileUrl } from '../../../../tools/commander/shared/files';
import { removeFolder, tempFolder } from '../../../repositories';
import {
  root,
  at,
  folder,
  file,
  commander,
  tab,
  forged,
} from './commanderFixtures';

suite('Commander tool serving icons', () => {
  test('gives a viewing or editing tab the icon of its file, at an address naming the file, as a closed tab’s id comes back for another file, served for that tab and file only', async () => {
    const { tool, tabs, iconsLoaded } = commander({});
    const viewing: Tab = {
      id: '3',
      tool: 'commander',
      root: at('notes.txt'),
      view: true,
    };
    const editing: Tab = {
      id: '6',
      tool: 'commander',
      root: at('code.ts'),
      edit: true,
    };
    tabs.push(viewing, { id: '4', tool: 'commander', root }, editing);
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
    assert.strictEqual(
      tool.names([editing]).get('6')?.icon,
      viewerIconUrl('6', at('code.ts')),
    );
    assert.strictEqual(await served(viewerIconUrl('6', at('code.ts'))), 200);
    assert.deepStrictEqual(iconsLoaded, [at('notes.txt'), at('code.ts')]);
    assert.strictEqual(
      tool.names([{ id: '4', tool: 'commander', root }]).get('4')?.icon,
      undefined,
    );
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
});

suite('Commander tool serving images', () => {
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
    const webp = new Uint8Array(
      Buffer.from('RIFF\x00\x00\x00\x00WEBPVP8 made'),
    );
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
    assert.deepStrictEqual(await served(96), ['image/png', null, 'the image']);
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
        thumbnailUrl({ tab: '1', side: 'right', folder: opened, name }, '1:0'),
        144,
        1.5,
      );
      const response = await tool.thumbnail(
        new URL(`fastforward://app${filling ? filledThumbnailUrl(url) : url}`),
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
});

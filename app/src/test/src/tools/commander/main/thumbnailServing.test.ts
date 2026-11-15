import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import {
  thumbnailUrl,
  boxedThumbnailUrl,
  filledThumbnailUrl,
  madeThumbnailHeader,
  maxThumbnailBytes,
} from '../../../../../tools/commander/shared/thumbnails';
import { maxImageSize } from '../../../../../lib/shared/images';
import { thumbnailKey } from '../../../../../tools/commander/main/thumbnailStore';
import { commander, tab } from './commanderFixtures';
import { root, folder, file } from './entryFixtures';
import { removeFolder, tempFolder } from '../../../../helpers/tempFolders';

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
});

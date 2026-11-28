import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import { maxImageSize } from '../../../../../lib/shared/images';
import { viewedFileUrl } from '../../../../../tools/viewer/shared/files';
import { removeFolder, tempFolder } from '../../../../helpers/tempFolders';
import { viewer } from './viewerFixtures';

suite('Viewer tool serving the files of a tab', () => {
  let opened: string;

  beforeEach(() => {
    opened = tempFolder('viewer');
  });

  afterEach(() => removeFolder(opened));

  test('serves the images of a viewing tab, the file viewed and those a document shows, refusing other files, other tabs, relative paths and images too large', async () => {
    const { tool, tabs } = viewer();
    const picture = path.join(opened, 'picture.png');
    fs.writeFileSync(picture, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    fs.writeFileSync(path.join(opened, 'notes.txt'), 'not an image');
    const large = path.join(opened, 'large.png');
    const handle = fs.openSync(large, 'w');
    fs.ftruncateSync(handle, maxImageSize + 1);
    fs.closeSync(handle);
    tabs.push(
      { id: '3', tool: 'viewer', root: path.join(opened, 'readme.md') },
      { id: '4', tool: 'commander', root: opened },
    );
    const served = (tab: string, image: string) =>
      tool.file(new URL(`fastforward://app${viewedFileUrl(tab, image)}`), null);

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

  test('serves a document only the images of its repository, or of its own folder and those below it outside one, as a document could name any image of the drive by going up its folders', async () => {
    const { tool, tabs } = viewer();
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const repository = path.join(opened, 'repository');
    const loose = path.join(opened, 'loose');
    for (const folder of [
      path.join(repository, '.git'),
      path.join(repository, 'docs'),
      path.join(repository, 'assets'),
      path.join(loose, 'pictures'),
    ]) {
      fs.mkdirSync(folder, { recursive: true });
    }
    const inRepository = path.join(repository, 'assets', 'a.png');
    const below = path.join(loose, 'pictures', 'b.png');
    const outside = path.join(opened, 'outside.png');
    for (const image of [inRepository, below, outside]) {
      fs.writeFileSync(image, png);
    }
    tabs.push(
      { id: '3', tool: 'viewer', root: path.join(repository, 'docs', 'a.md') },
      { id: '4', tool: 'viewer', root: path.join(loose, 'b.md') },
    );
    const status = async (tab: string, image: string) =>
      (
        await tool.file(
          new URL(`fastforward://app${viewedFileUrl(tab, image)}`),
          null,
        )
      ).status;

    assert.deepStrictEqual(
      [
        await status('3', inRepository),
        await status('3', outside),
        await status('4', below),
        await status('4', outside),
        await status('4', inRepository),
      ],
      [200, 404, 200, 404, 404],
    );
  });

  test.skipIf(process.platform === 'win32')(
    'serves no image whose real path leaves the folder of the document, as a link beside it named as an image could lead anywhere',
    async () => {
      const { tool, tabs } = viewer();
      const loose = path.join(opened, 'loose');
      fs.mkdirSync(loose);
      const secret = path.join(opened, 'secret.png');
      fs.writeFileSync(secret, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
      const linked = path.join(loose, 'linked.png');
      fs.symlinkSync(secret, linked);
      tabs.push({ id: '3', tool: 'viewer', root: path.join(loose, 'a.md') });

      const served = await tool.file(
        new URL(`fastforward://app${viewedFileUrl('3', linked)}`),
        null,
      );

      assert.strictEqual(served.status, 404);
    },
  );

  test.skipIf(process.platform !== 'win32')(
    'refuses the images of a drive or share other than that of the file viewed, as a document on a share could name an image on a host of its own and have Windows sign in to it',
    async () => {
      const { tool, tabs } = viewer();
      const picture = path.join(opened, 'picture.png');
      fs.writeFileSync(picture, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
      tabs.push({
        id: '3',
        tool: 'viewer',
        root: '\\\\fileserver\\team\\readme.md',
      });

      const served = await tool.file(
        new URL(`fastforward://app${viewedFileUrl('3', picture)}`),
        null,
      );

      assert.strictEqual(served.status, 404);
    },
  );
  test('serves a PDF only to the tab viewing it, by the ranges of bytes asked for, whatever its size', async () => {
    const { tool, tabs } = viewer();
    const book = path.join(opened, 'book.pdf');
    const other = path.join(opened, 'other.pdf');
    fs.writeFileSync(book, '%PDF-1.7 book');
    fs.writeFileSync(other, '%PDF-1.7 other');
    tabs.push({ id: '3', tool: 'viewer', root: book });
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

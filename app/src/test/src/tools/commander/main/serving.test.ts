import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import type { Tab } from '../../../../../shell/main/toolContract';
import {
  iconUrl,
  viewerIconUrl,
} from '../../../../../tools/commander/shared/icons';
import { maxImageSize } from '../../../../../lib/shared/images';
import { viewedFileUrl } from '../../../../../tools/commander/shared/files';
import {
  root,
  at,
  folder,
  file,
  commander,
  tab,
  forged,
} from './commanderFixtures';
import { removeFolder, tempFolder } from '../../../../helpers/tempFolders';

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
});

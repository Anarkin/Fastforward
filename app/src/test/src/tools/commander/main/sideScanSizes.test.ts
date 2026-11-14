import * as assert from 'node:assert';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import type { Entry } from '../../../../../tools/commander/shared/protocol';
import type { ElevatedFileSystem } from '../../../../../tools/commander/main/elevated';
import type { SizeWalk } from '../../../../../tools/commander/main/folderSizes';
import { waitFor } from '../../../../helpers/fixtures';
import {
  CommanderPage,
  root,
  at,
  folder,
  file,
  type Listed,
  commander,
  tab,
  forged,
} from './commanderFixtures';

const downloads = at('Downloads');
const inDownloads = (...names: string[]) => path.join(downloads, ...names);

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
    const downloadsTree = sizedTree();
    const { page, send, change } = await inDownloadsFolder(downloadsTree);
    const countPhotos = () =>
      send({ type: 'countSizes', tab: '1', side: 'right', names: ['photos'] });

    await countPhotos();
    await counted(page, `right ${downloads} photos: 2`);
    downloadsTree[downloads] = [
      file('setup.exe'),
      file('new.txt'),
      folder('photos'),
      folder('music'),
    ];
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

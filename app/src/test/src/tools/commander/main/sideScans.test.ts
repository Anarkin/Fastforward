import * as assert from 'node:assert';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import type { Entry } from '../../../../../tools/commander/shared/protocol';
import { iconUrl } from '../../../../../tools/commander/shared/icons';
import type { ElevatedFileSystem } from '../../../../../tools/commander/main/elevated';
import type { SizeWalk } from '../../../../../tools/commander/main/folderSizes';
import { strings } from '../../../../../lib/shared/strings';
import { waitFor } from '../../../../helpers/fixtures';
import {
  CommanderPage,
  root,
  at,
  folder,
  file,
  type Listed,
  commander,
  plansOf,
  tab,
  forged,
} from './commanderFixtures';

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

const workDir = at('work');
const sized = (name: string, size: number): Entry => ({ ...file(name), size });

const workTree = (): Record<string, Listed> => ({
  [root]: [folder('work')],
  [workDir]: [
    sized('a.txt', 3),
    sized('b.txt', 3),
    sized('c.txt', 5),
    folder('sub'),
  ],
  [path.join(workDir, 'sub')]: [sized('d.txt', 3)],
});

const workContents: Readonly<Record<string, string>> = {
  [path.join(workDir, 'a.txt')]: 'abc',
  [path.join(workDir, 'b.txt')]: 'abc',
  [path.join(workDir, 'c.txt')]: 'xyzzy',
  [path.join(workDir, 'sub', 'd.txt')]: 'abc',
};

const groupsTold = (page: CommanderPage) =>
  (page.of('duplicateGroups').at(-1)?.groups ?? [])
    .map((group) => [...group].toSorted())
    .toSorted((one, other) => one.join().localeCompare(other.join()));

const grouped = (page: CommanderPage, from: number) =>
  waitFor(
    () =>
      page.of('duplicateGroups').length > from &&
      page.of('duplicateGroups').at(-1)?.reading === false,
    'the groups of duplicates',
  );

async function inWork(listed: Record<string, Listed> = workTree()) {
  const made = commander(listed);
  Object.assign(made.contents, workContents);
  await made.tool.show(made.page, tab);
  await made.send({ type: 'open', tab: '1', side: 'right', name: 'work' });
  return { ...made, listed };
}

suite('Commander tool finding duplicates', () => {
  test('groups the files of the folder of a side by their content once asked, whatever their names, telling the page the side shows them, and shows every file again once asked', async () => {
    const { page, send } = await inWork();

    await send({
      type: 'duplicates',
      tab: '1',
      side: 'right',
      duplicates: true,
    });
    await grouped(page, 0);
    const shown = page.of('listing').at(-1);
    const told = page.of('duplicateGroups').at(-1);
    await send({
      type: 'duplicates',
      tab: '1',
      side: 'right',
      duplicates: false,
    });

    assert.deepStrictEqual(groupsTold(page), [['a.txt', 'b.txt']]);
    assert.deepStrictEqual(
      [shown?.side, shown?.folder, typeof shown?.duplicates],
      ['right', workDir, 'number'],
    );
    assert.deepStrictEqual(
      [told?.side, told?.folder, told?.look],
      ['right', workDir, shown?.duplicates],
    );
    assert.strictEqual(page.of('listing').at(-1)?.duplicates, undefined);
  });

  test('groups every file under the folder by its path under it once the side shows them flat, before or after it was asked', async () => {
    const { page, send } = await inWork();
    await send({
      type: 'duplicates',
      tab: '1',
      side: 'right',
      duplicates: true,
    });
    await grouped(page, 0);
    const told = page.of('duplicateGroups').length;

    await send({ type: 'flat', tab: '1', side: 'right', flat: true });
    await readAll(page);
    await waitFor(
      () => groupsTold(page).at(0)?.length === 3,
      'the files under the folder',
    );

    assert.ok(page.of('duplicateGroups').length > told);
    assert.deepStrictEqual(groupsTold(page), [
      ['a.txt', 'b.txt', `sub${path.sep}d.txt`],
    ]);
    assert.strictEqual(typeof page.of('listing').at(-1)?.duplicates, 'number');
  });

  test('stops showing duplicates once the side goes to another folder', async () => {
    const { page, send } = await inWork();
    await send({
      type: 'duplicates',
      tab: '1',
      side: 'right',
      duplicates: true,
    });
    await grouped(page, 0);

    await send({ type: 'open', tab: '1', side: 'right', name: '..' });

    const listing = page.of('listing').at(-1);
    assert.deepStrictEqual(
      [listing?.folder, listing?.duplicates],
      [root, undefined],
    );
  });

  test('groups the files again once the folder changes, reading only the files it has not read, as after a delete', async () => {
    const { page, send, listed, change, contentReads } = await inWork();
    await send({
      type: 'duplicates',
      tab: '1',
      side: 'right',
      duplicates: true,
    });
    await grouped(page, 0);
    const reads = contentReads.length;
    const told = page.of('duplicateGroups').length;

    listed[workDir] = [sized('a.txt', 3), sized('c.txt', 5), folder('sub')];
    await change(workDir);
    await grouped(page, told);

    assert.deepStrictEqual(groupsTold(page), []);
    assert.strictEqual(contentReads.length, reads);
  });

  test('reads no more files once told to stop, grouping what it read, and reads every file again on F2', async () => {
    const { page, send, listed, change, contents, contentReads } =
      await inWork();
    await send({
      type: 'duplicates',
      tab: '1',
      side: 'right',
      duplicates: true,
    });
    await grouped(page, 0);
    await send({ type: 'stopReading', tab: '1', side: 'right' });
    contents[path.join(workDir, 'e.txt')] = 'abc';
    listed[workDir] = [
      sized('a.txt', 3),
      sized('b.txt', 3),
      sized('c.txt', 5),
      folder('sub'),
      sized('e.txt', 3),
    ];
    const told = page.of('duplicateGroups').length;

    await change(workDir);
    await grouped(page, told);
    const stopped = {
      groups: groupsTold(page),
      readE: contentReads.includes(path.join(workDir, 'e.txt')),
    };
    await send({ type: 'reread', tab: '1', side: 'right' });
    await waitFor(
      () => groupsTold(page).at(0)?.length === 3,
      'the files read again',
    );

    assert.deepStrictEqual(stopped, {
      groups: [['a.txt', 'b.txt']],
      readE: false,
    });
    assert.deepStrictEqual(groupsTold(page), [['a.txt', 'b.txt', 'e.txt']]);
  });

  test('reads no link, no empty file and no file kept online or streamed, which reading would download', async () => {
    const listed: Record<string, Listed> = {
      [root]: [folder('work')],
      [workDir]: [
        sized('a.txt', 3),
        sized('b.txt', 3),
        { ...sized('link.txt', 3), link: true },
        { ...sized('online.txt', 3), online: true },
        sized('streamed.txt', 3),
        sized('empty.txt', 0),
        sized('none.txt', 0),
      ],
    };
    const { page, send, streamed, contents, contentReads } =
      await inWork(listed);
    for (const name of ['link.txt', 'online.txt', 'streamed.txt']) {
      contents[path.join(workDir, name)] = 'abc';
    }
    streamed.add(path.join(workDir, 'streamed.txt'));

    await send({
      type: 'duplicates',
      tab: '1',
      side: 'right',
      duplicates: true,
    });
    await grouped(page, 0);

    assert.deepStrictEqual(groupsTold(page), [['a.txt', 'b.txt']]);
    assert.deepStrictEqual(
      contentReads.map((read) => path.basename(read)).toSorted(),
      ['a.txt', 'b.txt'],
    );
  });

  test('is not turned on by a forged message, nor for a side it does not show', async () => {
    const { page, send } = await inWork();

    await send(
      forged(
        '{ "type": "duplicates", "tab": "1", "side": "right", "duplicates": "yes" }',
      ),
    );
    await send({
      type: 'duplicates',
      tab: '2',
      side: 'right',
      duplicates: true,
    });
    await send(
      forged(
        '{ "type": "duplicates", "tab": "1", "side": "middle", "duplicates": true }',
      ),
    );

    assert.ok(
      page.of('listing').every((listing) => listing.duplicates === undefined),
    );
    assert.deepStrictEqual(page.of('duplicateGroups'), []);
  });
});

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

  test('reads every folder again once the system cannot say what changed, sending the page only those that changed', async () => {
    const listed = tree();
    const { page, changeTree } = await flatDownloads(listed);
    const before = page.of('flatFiles').length;

    listed[inDownloads('photos', '2024')] = [file('dog.jpg'), file('owl.jpg')];
    changeTree(downloads, undefined);
    await waitFor(
      () => flatFiles(page, before).length > 0,
      'the folders read again',
    );
    await new Promise((resolve) => setTimeout(resolve, 150));

    assert.deepStrictEqual(flatFiles(page, before), [
      `right 1 ${under('photos', '2024')}: dog.jpg owl.jpg`,
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

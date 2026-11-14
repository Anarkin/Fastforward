import * as assert from 'node:assert';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import type { Entry } from '../../../../../tools/commander/shared/protocol';
import { iconUrl } from '../../../../../tools/commander/shared/icons';
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

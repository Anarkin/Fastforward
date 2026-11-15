import * as assert from 'node:assert';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import type { Entry } from '../../../../../tools/commander/shared/protocol';
import { waitFor } from '../../../../helpers/fixtures';
import { type Listed, commander, tab, forged } from './commanderFixtures';
import { CommanderPage } from './fakePage';
import { root, at, folder, file } from './entryFixtures';

const progressOf = (page: CommanderPage) =>
  page.of('flatFiles').at(-1)?.progress;

const readAll = (page: CommanderPage) =>
  waitFor(
    () => progressOf(page)?.reading === false,
    'the reading of the folders',
  );

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

import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import type { Side } from '../../../../../tools/commander/shared/sides';
import type { ElevatedFileSystem } from '../../../../../tools/commander/main/elevated';
import { strings } from '../../../../../lib/shared/strings';
import { waitFor } from '../../../../helpers/fixtures';
import { commander, plansOf, tab } from './commanderFixtures';
import { root, at, folder, file } from './entryFixtures';
import { withCopiesFolder, commanderInArchive } from './copiesFixtures';
import { archiveItem, zipped } from './fakeArchives';

suite('Commander tool in archives', () => {
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
    assert.deepStrictEqual(page.of('askExisting'), [
      {
        type: 'askExisting',
        tab: '1',
        side: 'right',
        folder: root,
        names: ['top.txt', 'new.txt'],
        target: at('a.zip'),
        move: false,
        existing: ['top.txt'],
      },
    ]);
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
      { level: 'error', message: strings.commander.intoItself(at('a.zip')) },
      {
        level: 'error',
        message: strings.commander.movedWithout(
          at('a.zip'),
          'locked.txt: It is in use',
        ),
      },
    ]);
  });

  test('asks for the password of an archive whose files are encrypted before adding items to it, adding nothing without one, as the items went in unencrypted beside encrypted ones', async () => {
    const { tool, page, send, archived, secrets, changedInArchives } =
      commander({ [root]: [file('a.zip'), file('new.txt')] });
    archived.set(at('a.zip'), [
      { ...archiveItem('secret.txt'), encrypted: true },
    ]);
    secrets.set(at('a.zip'), 'right');
    await tool.show(page, tab);
    await send({ type: 'enterArchive', tab: '1', side: 'left', name: 'a.zip' });
    const copying = send({
      type: 'transfer',
      tab: '1',
      side: 'right',
      folder: root,
      names: ['new.txt'],
      target: at('a.zip'),
      move: false,
    });
    await waitFor(
      () => page.of('askPassword').length === 1,
      'the password of the archive to be asked',
    );
    assert.deepStrictEqual(changedInArchives, []);

    await send({
      type: 'password',
      ask: page.of('askPassword').at(-1)?.ask ?? 0,
    });
    await copying;
    assert.deepStrictEqual(changedInArchives, []);
  });

  test('keeps what changed in an item moved into an archive while it was packed, deleting only what it took stock of before, and says which', async () => {
    const { tool, page, send, archived, removed, notices } = commander({
      [root]: [file('a.zip'), folder('busy'), file('new.txt')],
    });
    archived.set(at('a.zip'), zipped);
    await tool.show(page, tab);
    await send({ type: 'enterArchive', tab: '1', side: 'left', name: 'a.zip' });
    await send({
      type: 'transfer',
      tab: '1',
      side: 'right',
      folder: root,
      names: ['busy', 'new.txt'],
      target: at('a.zip'),
      move: true,
    });
    await waitFor(() => notices.length === 1, 'the move to end');

    assert.deepStrictEqual(removed, [at('busy'), at('new.txt')]);
    assert.deepStrictEqual(notices, [
      {
        level: 'error',
        message: strings.commander.movedWithout(
          at('a.zip'),
          strings.commander.changedWhilePacked(['busy']),
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

  suite('reading its files', () => {
    let copiesFolder: string;

    withCopiesFolder((made) => {
      copiesFolder = made;
    });

    const inArchive = () => commanderInArchive(copiesFolder);

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

    test('copies and moves nothing out of an archive into a folder read as administrator, saying so, and takes nothing out', async () => {
      const helper: ElevatedFileSystem = {
        list: () => Promise.resolve([]),
        drives: () => Promise.resolve([]),
        watch: () => () => {},
        closed: new Promise(() => {}),
        close: () => {},
      };
      const made = commander(
        {
          [root]: [file('a.zip'), folder('Config.Msi')],
          [at('Config.Msi')]: Object.assign(new Error('denied'), {
            code: 'EPERM',
          }),
        },
        [],
        () => Promise.resolve(helper),
      );
      made.archived.set(at('a.zip'), zipped);
      made.copies.folder = copiesFolder;
      const { tool, page, send, notices, transfers, extracted } = made;
      await tool.show(page, tab);
      await send({
        type: 'enterArchive',
        tab: '1',
        side: 'right',
        name: 'a.zip',
      });
      await send({ type: 'open', tab: '1', side: 'left', name: 'Config.Msi' });
      await send({ type: 'elevate', tab: '1', side: 'left' });

      for (const move of [false, true]) {
        await send({
          type: 'transfer',
          tab: '1',
          side: 'right',
          names: ['top.txt'],
          target: at('Config.Msi'),
          move,
        });
      }

      assert.deepStrictEqual(plansOf(transfers), []);
      assert.deepStrictEqual(extracted, []);
      assert.deepStrictEqual(notices, [
        { level: 'error', message: strings.commander.transferAsAdministrator },
        { level: 'error', message: strings.commander.transferAsAdministrator },
      ]);
    });

    test('refuses to take an item out of an archive onto the archive itself, as a.zip holding an a.zip, copied or moved out into the folder of a.zip, replaced the archive it was taken out of once Overwrite was answered', async () => {
      const made = commander({ [root]: [file('a.zip')] });
      made.archived.set(at('a.zip'), [
        archiveItem('a.zip'),
        archiveItem('b.txt'),
      ]);
      made.copies.folder = copiesFolder;
      await made.tool.show(made.page, tab);
      const { send, transfers, notices } = made;
      await send({
        type: 'enterArchive',
        tab: '1',
        side: 'right',
        name: 'a.zip',
      });

      for (const move of [false, true]) {
        await send({
          type: 'transfer',
          tab: '1',
          side: 'right',
          names: ['a.zip', 'b.txt'],
          target: root,
          move,
        });
      }

      await waitFor(() => notices.length === 2, 'both refused');
      assert.deepStrictEqual(plansOf(transfers), []);
      assert.deepStrictEqual(notices, [
        {
          level: 'error',
          message: strings.commander.overItsArchive(at('a.zip')),
        },
        {
          level: 'error',
          message: strings.commander.overItsArchive(at('a.zip')),
        },
      ]);
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
      await waitFor(
        () => page.of('askExisting').length > 0,
        'the items there already to be asked about',
      );
      assert.deepStrictEqual(
        page.of('askExisting').map((message) => message.existing),
        [['top.txt']],
      );
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
        {
          level: 'error',
          message: strings.commander.intoItself(at('a.zip', 'docs')),
        },
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
  });
});

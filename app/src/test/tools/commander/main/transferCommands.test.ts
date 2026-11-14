import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import type { ElevatedFileSystem } from '../../../../tools/commander/main/elevated';
import { strings } from '../../../../lib/shared/strings';
import { removeFolder, tempFolder } from '../../../repositories';
import { waitFor } from '../../../fixtures';
import {
  root,
  at,
  folder,
  file,
  commander,
  plansOf,
  tab,
  forged,
  zipped,
} from './commanderFixtures';

suite('Commander tool', () => {
  test('copies or moves the items asked for into the folder of the other side, only when every one is listed in the folder named, never its parent, and the other side still shows the folder named as the target', async () => {
    const { tool, page, send, transfers } = commander({
      [root]: [file('a.txt'), folder('dir'), folder('target')],
      [at('target')]: [],
    });
    await tool.show(page, tab);
    await send({ type: 'open', tab: '1', side: 'left', name: 'target' });
    const transfer = (names: string[], move: boolean, target = at('target')) =>
      send({ type: 'transfer', tab: '1', side: 'right', names, target, move });

    await transfer(['a.txt', 'dir'], false);
    await transfer(['a.txt'], true);
    await transfer(['a.txt', '..'], false);
    await transfer(['gone.txt'], false);
    await transfer([], false);
    await transfer(['a.txt'], false, root);
    await send(
      forged(
        JSON.stringify({
          type: 'transfer',
          tab: '1',
          side: 'right',
          folder: root,
          names: ['a.txt'],
          target: at('target'),
          move: 'yes',
        }),
      ),
    );

    assert.deepStrictEqual(plansOf(transfers), [
      { sources: [at('a.txt'), at('dir')], target: at('target'), move: false },
      { sources: [at('a.txt')], target: at('target'), move: true },
    ]);
  });
  test('says the items are in the folder already rather than copying them onto themselves, that a folder cannot go into itself or a folder in it, and that nothing is copied or moved yet in a folder read as administrator', async () => {
    const helper: ElevatedFileSystem = {
      list: () => Promise.resolve([file('secret.txt')]),
      drives: () => Promise.resolve([]),
      watch: () => () => {},
      closed: new Promise(() => {}),
      close: () => {},
    };
    const { tool, page, send, notices, transfers } = commander(
      {
        [root]: [file('a.txt'), folder('dir'), folder('Config.Msi')],
        [at('dir')]: [folder('inner')],
        [at('dir', 'inner')]: [],
        [at('Config.Msi')]: Object.assign(new Error('denied'), {
          code: 'EPERM',
        }),
      },
      [],
      () => Promise.resolve(helper),
    );
    await tool.show(page, tab);
    const transfer = (names: string[], target: string) =>
      send({
        type: 'transfer',
        tab: '1',
        side: 'right',
        names,
        target,
        move: true,
      });

    await transfer(['a.txt'], root);
    await send({ type: 'open', tab: '1', side: 'left', name: 'dir' });
    await send({ type: 'open', tab: '1', side: 'left', name: 'inner' });
    await transfer(['a.txt', 'dir'], at('dir', 'inner'));
    await send({ type: 'open', tab: '1', side: 'left', name: '..' });
    await transfer(['dir'], at('dir'));
    await send({ type: 'open', tab: '1', side: 'left', name: '..' });
    await send({ type: 'open', tab: '1', side: 'left', name: 'Config.Msi' });
    await send({ type: 'elevate', tab: '1', side: 'left' });
    await transfer(['a.txt'], at('Config.Msi'));
    await send({
      type: 'transfer',
      tab: '1',
      side: 'left',
      names: ['secret.txt'],
      target: root,
      move: false,
    });

    assert.deepStrictEqual(plansOf(transfers), []);
    assert.deepStrictEqual(notices, [
      { level: 'error', message: strings.commander.alreadyIn(root) },
      { level: 'error', message: strings.commander.intoItself('dir') },
      { level: 'error', message: strings.commander.intoItself('dir') },
      { level: 'error', message: strings.commander.transferAsAdministrator },
      { level: 'error', message: strings.commander.transferAsAdministrator },
    ]);
  });
  test('has the shell ask before quitting while a copy runs, saying quitting stops it, and no longer once it is done', async () => {
    const { tool, page, send, transfers } = commander({
      [root]: [file('a.txt'), folder('target')],
      [at('target')]: [],
    });
    await tool.show(page, tab);
    assert.strictEqual(tool.quitNote(), undefined);
    await send({ type: 'open', tab: '1', side: 'left', name: 'target' });
    await send({
      type: 'transfer',
      tab: '1',
      side: 'right',
      names: ['a.txt'],
      target: at('target'),
      move: false,
    });
    await send({ type: 'hideTransfer', transfer: 1 });

    assert.strictEqual(tool.quitNote(), strings.commander.quitStopsTransfers);
    transfers[0].listener.event({ type: 'done', stopped: false });
    await waitFor(() => tool.quitNote() === undefined, 'the copy to end');
  });
  test('shows the page the transfer to show and what it asks, sends on what the page answers to it, and lists the side showing its target again once it is done', async () => {
    const { tool, page, send, transfers } = commander({
      [root]: [file('a.txt'), folder('target')],
      [at('target')]: [],
    });
    await tool.show(page, tab);
    await send({ type: 'open', tab: '1', side: 'left', name: 'target' });
    await send({
      type: 'transfer',
      tab: '1',
      side: 'right',
      names: ['a.txt'],
      target: at('target'),
      move: false,
    });
    const shown = () => page.of('transfer').at(-1)?.view;
    assert.deepStrictEqual(shown(), {
      id: 1,
      move: false,
      items: 1,
      name: 'a.txt',
      target: at('target'),
      stopping: false,
    });

    const clash = {
      name: 'a.txt',
      source: { size: 1, modified: 2 },
      target: { size: 3, modified: 4 },
    };
    transfers[0].listener.event({ type: 'clash', clash });
    assert.deepStrictEqual(shown()?.clash, { ...clash, asked: 1 });
    await send({
      type: 'answerClash',
      transfer: 1,
      asked: 1,
      answer: 'overwrite',
      all: false,
    });
    await send({ type: 'hideTransfer', transfer: 1 });
    assert.strictEqual(shown(), undefined);
    tool.ready(page);
    assert.strictEqual(page.of('transfer').at(-1)?.view, undefined);
    await send({ type: 'stopTransfer', transfer: 1 });
    assert.deepStrictEqual(transfers[0].commands.slice(1), [
      { type: 'answer', reply: { answer: 'overwrite', all: false } },
      { type: 'stop' },
    ]);

    const listings = page.listings().length;
    transfers[0].listener.event({ type: 'done', stopped: true });
    await waitFor(
      () => page.listings().length > listings,
      'the target to be listed again',
    );
    assert.deepStrictEqual(page.listings().slice(listings), [
      `left ${at('target')} ↑: `,
    ]);
  });
  test('copies or moves the files dropped on a side into its folder, the folder they were dropped on or its parent, only while the side shows the folder named and every file is a whole path, refusing them in the folder they are in', async () => {
    const { tool, page, send, transfers, notices } = commander({
      [root]: [file('a.txt'), folder('target')],
      [at('target')]: [folder('inner'), file('b.txt')],
      [at('target', 'inner')]: [],
    });
    await tool.show(page, tab);
    await send({ type: 'open', tab: '1', side: 'right', name: 'target' });
    const elsewhere = path.join(root, 'elsewhere');
    const files = [path.join(elsewhere, 'x.txt'), path.join(elsewhere, 'y')];
    const drop = (message: object, dropped: unknown = files) =>
      tool.dropped(page, dropped, {
        type: 'drop',
        tab: '1',
        side: 'right',
        folder: at('target'),
        move: false,
        ...message,
      });

    await drop({});
    await drop({ into: 'inner', move: true });
    await drop({ into: '..' });
    await drop({ into: 'b.txt' });
    await drop({ into: 'gone' });
    await drop({ folder: root });
    await drop({}, ['relative.txt']);
    await drop({}, []);
    await drop({}, [7]);
    await drop({}, 'x.txt');
    await drop({ move: 'yes' });
    await tool.dropped(page, files, { type: 'other' });
    await drop({}, [at('target', 'b.txt')]);

    assert.deepStrictEqual(plansOf(transfers), [
      { sources: files, target: at('target'), move: false },
      { sources: files, target: at('target', 'inner'), move: true },
      { sources: files, target: root, move: false },
    ]);
    assert.deepStrictEqual(notices, [
      { level: 'error', message: strings.commander.alreadyIn(at('target')) },
    ]);
  });
  test('pastes the files on the clipboard into the folder named as a copy of them, refusing them in the folder they are in or a folder into itself, and saying when the clipboard holds no files', async () => {
    const { tool, page, send, clipboard, transfers, notices } = commander({
      [root]: [file('a.txt'), folder('dir')],
      [at('dir')]: [],
    });
    await tool.show(page, tab);
    const paste = () => send({ type: 'paste', tab: '1', side: 'right' });

    await paste();
    clipboard.files = [at('a.txt')];
    await paste();
    clipboard.files = [at('dir')];
    await send({ type: 'open', tab: '1', side: 'right', name: 'dir' });
    await paste();
    clipboard.files = [at('a.txt'), path.join(root, 'elsewhere', 'b.txt')];
    await paste();

    assert.deepStrictEqual(plansOf(transfers), [
      {
        sources: [at('a.txt'), path.join(root, 'elsewhere', 'b.txt')],
        target: at('dir'),
        move: false,
      },
    ]);
    assert.deepStrictEqual(notices, [
      { level: 'info', message: strings.commander.nothingToPaste },
      { level: 'error', message: strings.commander.alreadyIn(root) },
      { level: 'error', message: strings.commander.intoItself('dir') },
    ]);
  });
  test('packs the items a side lists into the archive asked for, shown in the dialog of copies as packing, and nothing of items it does not list, nor an archive of a name no folder can hold, into one of the items, nor with a password a zip cannot hold', async () => {
    const { tool, page, send, packed, notices } = commander({
      [root]: [file('a.txt'), folder('docs')],
    });
    await tool.show(page, tab);
    const archive = path.join(root, 'out', 'photos.zip');
    const pack = (extra: Record<string, unknown> = {}) =>
      send(
        forged(
          JSON.stringify({
            type: 'pack',
            tab: '1',
            side: 'right',
            folder: root,
            names: ['a.txt', 'docs'],
            archive,
            format: 'zip',
            level: 'normal',
            ...extra,
          }),
        ),
      );

    await pack({
      format: '7z',
      level: 'ultra',
      password: 'pässwörd',
      encryptNames: true,
      volumeBytes: 1_048_576,
      test: true,
    });
    await waitFor(() => packed.length === 1, 'the pack to start');
    assert.deepStrictEqual(
      page.of('transfer').find((message) => message.view?.archiveJob === 'pack')
        ?.view,
      {
        id: 1,
        move: false,
        archiveJob: 'pack',
        items: 2,
        target: archive,
        stopping: false,
      },
    );
    for (const wrong of [
      { names: ['missing.txt'] },
      { names: [] },
      { archive: 'photos.zip' },
      { archive: `${root}${path.sep}..` },
      { archive: at('docs', 'inside.zip') },
      { format: 'rar' },
      { level: 'best' },
      { password: 'pässwörd' },
      { password: '' },
      { volumeBytes: 1000 },
      { zipCipher: 'rot13' },
      { test: 'yes' },
    ]) {
      await pack(wrong);
    }

    assert.deepStrictEqual(packed, [
      {
        folder: root,
        items: ['a.txt', 'docs'],
        archive,
        format: '7z',
        level: 'ultra',
        password: 'pässwörd',
        encryptNames: true,
        volumeBytes: 1_048_576,
        test: true,
      },
    ]);
    assert.deepStrictEqual(notices, [
      { level: 'error', message: strings.commander.intoItself('docs') },
    ]);
  });
  test('packs over an archive there already, or its first volume, only when the dialog said it replaces it, saying so otherwise', async () => {
    const { tool, page, send, packed, notices } = commander({
      [root]: [file('a.txt')],
    });
    await tool.show(page, tab);
    const there = tempFolder('packed-there');
    try {
      fs.writeFileSync(path.join(there, 'photos.zip'), 'old');
      fs.writeFileSync(path.join(there, 'parts.7z.001'), 'old');
      const pack = (archive: string, extra: Record<string, unknown> = {}) =>
        send({
          type: 'pack',
          tab: '1',
          side: 'right',
          folder: root,
          names: ['a.txt'],
          archive: path.join(there, archive),
          format: archive.endsWith('.7z') ? '7z' : 'zip',
          level: 'normal',
          ...extra,
        });

      await pack('photos.zip');
      await pack('parts.7z', { volumeBytes: 1_048_576 });
      await pack('photos.zip', { replace: true });
      await waitFor(() => packed.length === 1, 'the pack to start');

      assert.deepStrictEqual(
        packed.map((plan) => path.basename(plan.archive)),
        ['photos.zip'],
      );
      assert.deepStrictEqual(notices, [
        {
          level: 'error',
          message: strings.commander.archiveThereKept(
            path.join(there, 'photos.zip'),
          ),
        },
        {
          level: 'error',
          message: strings.commander.archiveThereKept(
            path.join(there, 'parts.7z'),
          ),
        },
      ]);
    } finally {
      removeFolder(there);
    }
  });
  test('tests the archives a side lists one after another in the dialog of copies, asking the password of one encrypted, saying which failed and why or that they passed, and nothing of folders or items not listed', async () => {
    const { tool, page, send, tested, archiveTests, secrets, notices } =
      commander({
        [root]: [file('a.zip'), file('b.7z'), file('c.zip'), folder('dir')],
      });
    archiveTests.set(at('c.zip'), 'CRC Failed : x.txt');
    archiveTests.set(at('b.7z'), 'locked');
    secrets.set(at('b.7z'), 'right');
    await tool.show(page, tab);
    const testing = (names: string[]) =>
      send({
        type: 'testArchives',
        tab: '1',
        side: 'right',
        folder: root,
        names,
      });

    await testing(['missing.zip']);
    await testing(['dir']);
    await testing(['a.zip', 'b.7z', 'c.zip', 'dir']);
    await waitFor(
      () => page.of('askPassword').length === 1,
      'the password of b.7z to be asked',
    );
    await send({
      type: 'password',
      ask: page.of('askPassword')[0]?.ask ?? 0,
      password: 'right',
    });
    await waitFor(() => notices.length === 1, 'the tests to end');
    await testing(['a.zip']);
    await waitFor(() => notices.length === 2, 'the test of a.zip to end');

    assert.deepStrictEqual(tested, [
      at('a.zip'),
      at('b.7z'),
      at('b.7z'),
      at('c.zip'),
      at('a.zip'),
    ]);
    assert.deepStrictEqual(
      page.of('transfer').find((message) => message.view?.archiveJob === 'test')
        ?.view,
      {
        id: 1,
        move: false,
        archiveJob: 'test',
        items: 3,
        target: root,
        stopping: false,
      },
    );
    assert.deepStrictEqual(notices, [
      {
        level: 'error',
        message: strings.commander.testFailed('c.zip', 'CRC Failed : x.txt'),
      },
      {
        level: 'info',
        message: strings.commander.testPassed(
          strings.commander.oneItem('a.zip'),
        ),
      },
    ]);
  });
  test('ends every copy and move on quitting', async () => {
    const { tool, page, send, transfers } = commander({
      [root]: [file('a.txt'), folder('target')],
      [at('target')]: [],
    });
    await tool.show(page, tab);
    await send({ type: 'open', tab: '1', side: 'left', name: 'target' });
    await send({
      type: 'transfer',
      tab: '1',
      side: 'right',
      names: ['a.txt'],
      target: at('target'),
      move: false,
    });

    tool.quit();

    assert.deepStrictEqual(
      transfers.map((each) => each.disposed),
      [true],
    );
  });
});

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
      { level: 'error', message: strings.commander.intoItself('a.zip') },
      {
        level: 'error',
        message: strings.commander.movedWithout(
          'a.zip',
          'locked.txt: It is in use',
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
});

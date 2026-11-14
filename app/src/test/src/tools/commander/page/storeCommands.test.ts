import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { createCommanderStore } from '../../../../../tools/commander/page/store';
import { emptyView } from '../../../../../tools/commander/page/view';
import { noop } from '../../../../helpers/fixtures';
import { left, shown, listing } from './storeFixtures';

suite('Commander store', () => {
  test('asks before deleting, deleting once confirmed and nothing once cancelled', () => {
    const { posted, store } = shown();
    store.getState().askDelete('left', ['a'], true);
    assert.deepStrictEqual(store.getState().deleting, {
      tab: '1',
      side: 'left',
      folder: left.folder,
      names: ['a'],
      permanently: true,
    });
    store.getState().cancelDelete();
    assert.strictEqual(store.getState().deleting, undefined);
    store.getState().askDelete('left', ['b'], false);
    store.getState().confirmDelete();
    assert.strictEqual(store.getState().deleting, undefined);
    assert.deepStrictEqual(posted, [
      {
        type: 'delete',
        tab: '1',
        side: 'left',
        folder: left.folder,
        names: ['b'],
        permanently: false,
      },
    ]);
  });

  test('asks to delete permanently what is to go to the Recycle Bin of a drive whose Recycle Bin is turned off, deleting it permanently once confirmed, as moving it there failed', () => {
    const { posted, store } = shown();
    store.getState().receive({ ...listing('D:\\photos'), binOff: true });
    store.getState().askDelete('left', ['a'], false);
    assert.deepStrictEqual(store.getState().deleting, {
      tab: '1',
      side: 'left',
      folder: 'D:\\photos',
      names: ['a'],
      permanently: true,
      binOff: true,
    });
    store.getState().confirmDelete();
    store.getState().askDelete('left', ['b'], true);
    assert.strictEqual(store.getState().deleting?.binOff, undefined);
    store.getState().receive(listing('C:\\photos'));
    store.getState().askDelete('left', ['c'], false);
    assert.strictEqual(store.getState().deleting?.permanently, false);
    assert.deepStrictEqual(posted, [
      {
        type: 'delete',
        tab: '1',
        side: 'left',
        folder: 'D:\\photos',
        names: ['a'],
        permanently: true,
      },
    ]);
  });

  test('drops the question to delete once the side shows another folder or another tab is shown, as the files it names belong to the folder they were seen in', () => {
    const { posted, store } = shown();
    store.getState().askDelete('left', ['a'], true);
    store.getState().receive(listing(left.folder));
    assert.strictEqual(store.getState().deleting?.folder, left.folder);
    store.getState().receive(listing(`${left.folder}/sub`));
    assert.strictEqual(store.getState().deleting, undefined);
    store.getState().askDelete('left', ['b'], true);
    store.getState().receive({ type: 'show', tab: '2' });
    assert.strictEqual(store.getState().deleting, undefined);
    store.getState().confirmDelete();
    assert.deepStrictEqual(
      posted.filter((message) => message.type === 'delete'),
      [],
    );
  });

  test('asks before copying or moving into the folder of the other side, sending it once confirmed and nothing once cancelled, nor while the other side shows no folder', () => {
    const { posted, store } = shown();
    store.getState().askTransfer('left', ['a'], false);
    assert.strictEqual(store.getState().transferring, undefined);

    store.getState().receive({ ...listing('D:\\photos'), side: 'right' });
    store.getState().askTransfer('left', ['a'], true);
    assert.deepStrictEqual(store.getState().transferring, {
      tab: '1',
      side: 'left',
      folder: left.folder,
      names: ['a'],
      target: 'D:\\photos',
      move: true,
    });
    store.getState().cancelTransfer();
    assert.strictEqual(store.getState().transferring, undefined);
    store.getState().askTransfer('left', ['b', 'c'], false);
    store.getState().confirmTransfer();
    assert.strictEqual(store.getState().transferring, undefined);
    assert.deepStrictEqual(
      posted.filter((message) => message.type === 'transfer'),
      [
        {
          type: 'transfer',
          tab: '1',
          side: 'left',
          folder: left.folder,
          names: ['b', 'c'],
          target: 'D:\\photos',
          move: false,
        },
      ],
    );
  });

  test('drops the question to copy once either side shows another folder, as it names the items seen and the folder they would go to', () => {
    const { posted, store } = shown();
    store.getState().receive({ ...listing('D:\\photos'), side: 'right' });
    store.getState().askTransfer('left', ['a'], false);
    store.getState().receive({ ...listing('D:\\other'), side: 'right' });
    assert.strictEqual(store.getState().transferring, undefined);
    store.getState().askTransfer('left', ['a'], false);
    store.getState().receive(listing(`${left.folder}/sub`));
    assert.strictEqual(store.getState().transferring, undefined);
    store.getState().confirmTransfer();
    assert.deepStrictEqual(
      posted.filter((message) => message.type === 'transfer'),
      [],
    );
  });

  test('shows the copy or move the main process shows, sending on an answer to what it asks, a stop and the closing of its dialog for it', () => {
    const { posted, store } = shown();
    const view = {
      id: 3,
      move: false,
      items: 2,
      target: 'D:\\photos',
      clash: {
        name: 'a.jpg',
        source: { size: 1, modified: 2 },
        target: { size: 3, modified: 4 },
        asked: 5,
      },
      stopping: false,
    };
    store.getState().receive({ type: 'transfer', view });
    assert.deepStrictEqual(store.getState().transfer, view);

    store.getState().answerClash('keepBoth', true);
    store.getState().stopTransfer();
    store.getState().hideTransfer();
    store.getState().receive({ type: 'transfer', view: undefined });
    store.getState().stopTransfer();

    assert.strictEqual(store.getState().transfer, undefined);
    assert.deepStrictEqual(posted, [
      {
        type: 'answerClash',
        transfer: 3,
        asked: 5,
        answer: 'keepBoth',
        all: true,
      },
      { type: 'stopTransfer', transfer: 3 },
      { type: 'hideTransfer', transfer: 3 },
    ]);
  });

  test('puts items of a side on the clipboard, drags them and pastes into the folder of a side, for the tab shown', () => {
    const { posted, store } = shown();
    store.getState().copyToClipboard('left', ['a', 'b']);
    store.getState().paste('left');
    store.getState().paste('right');
    store.getState().drag('left', ['c']);
    assert.deepStrictEqual(posted, [
      {
        type: 'copyToClipboard',
        tab: '1',
        side: 'left',
        folder: left.folder,
        names: ['a', 'b'],
      },
      { type: 'paste', tab: '1', side: 'left', folder: left.folder },
      {
        type: 'drag',
        tab: '1',
        side: 'left',
        folder: left.folder,
        names: ['c'],
      },
    ]);
  });

  test('hands files dropped on a side over with the folder they go into and whether to move them, for the tab shown', () => {
    const dropped: { files: readonly File[]; message: unknown }[] = [];
    const store = createCommanderStore(
      noop,
      { view: { ...emptyView, tab: '1', panes: { left, right: undefined } } },
      undefined,
      (files, message) => dropped.push({ files, message }),
    );
    const files = [new File(['a'], 'a.txt')];
    store.getState().dropOn('left', files, 'docs', true);
    store.getState().dropOn('left', files, undefined, false);
    store.getState().dropOn('right', files, undefined, false);
    assert.deepStrictEqual(dropped, [
      {
        files,
        message: {
          type: 'drop',
          tab: '1',
          side: 'left',
          folder: left.folder,
          into: 'docs',
          move: true,
        },
      },
      {
        files,
        message: {
          type: 'drop',
          tab: '1',
          side: 'left',
          folder: left.folder,
          move: false,
        },
      },
    ]);
  });

  test('asks for the name of a new folder for the folder of a side, making it once named and nothing once cancelled, and drops the question once the side shows another folder', () => {
    const { posted, store } = shown();
    store.getState().askNewFolder('left');
    assert.deepStrictEqual(store.getState().makingFolder, {
      tab: '1',
      side: 'left',
      folder: left.folder,
    });
    store.getState().cancelNewFolder();
    assert.strictEqual(store.getState().makingFolder, undefined);
    store.getState().askNewFolder('left');
    store.getState().makeFolder('photos');
    assert.strictEqual(store.getState().makingFolder, undefined);
    store.getState().askNewFolder('left');
    store.getState().receive(listing(`${left.folder}/sub`));
    assert.strictEqual(store.getState().makingFolder, undefined);
    store.getState().makeFolder('late');

    assert.deepStrictEqual(
      posted.filter((message) => message.type === 'newFolder'),
      [
        {
          type: 'newFolder',
          tab: '1',
          side: 'left',
          folder: left.folder,
          name: 'photos',
        },
      ],
    );
  });

  test('asks for the new name of a file or folder of a side, renaming it once named, and nothing once cancelled, given its own name or once the side shows another folder', () => {
    const { posted, store } = shown();
    const actions = store.getState();
    actions.askRename('left', 'a.txt');
    assert.deepStrictEqual(store.getState().renaming, {
      tab: '1',
      side: 'left',
      folder: left.folder,
      name: 'a.txt',
    });
    actions.cancelRename();
    assert.strictEqual(store.getState().renaming, undefined);
    actions.askRename('left', 'a.txt');
    actions.rename('a.txt');
    assert.strictEqual(store.getState().renaming, undefined);
    actions.askRename('left', 'a.txt');
    actions.rename('b.txt');
    actions.askRename('left', 'a.txt');
    store.getState().receive(listing(`${left.folder}/sub`));
    assert.strictEqual(store.getState().renaming, undefined);
    actions.rename('late');

    assert.deepStrictEqual(
      posted.filter((message) => message.type === 'rename'),
      [
        {
          type: 'rename',
          tab: '1',
          side: 'left',
          folder: left.folder,
          name: 'a.txt',
          to: 'b.txt',
        },
      ],
    );
  });

  test('asks for the path to go to on a side, from the folder it shows, going there once told, and nowhere once cancelled or the side shows another folder', () => {
    const { posted, store } = shown();
    const actions = store.getState();
    actions.askGoTo('left');
    assert.deepStrictEqual(store.getState().goingTo, {
      tab: '1',
      side: 'left',
      folder: left.folder,
    });
    actions.cancelGoTo();
    assert.strictEqual(store.getState().goingTo, undefined);
    actions.askGoTo('left');
    actions.goTo('D:\\Work');
    assert.strictEqual(store.getState().goingTo, undefined);
    actions.askGoTo('left');
    store.getState().receive(listing(`${left.folder}/sub`));
    assert.strictEqual(store.getState().goingTo, undefined);
    actions.goTo('late');

    assert.deepStrictEqual(
      posted.filter((message) => message.type === 'goTo'),
      [
        {
          type: 'goTo',
          tab: '1',
          side: 'left',
          folder: left.folder,
          to: 'D:\\Work',
        },
      ],
    );
  });

  test('asks how to pack the items of a side into the folder of the other side, its own while the other is in an archive, packing them once told and remembering the choices but no password, and nothing once cancelled or the side shows another folder', () => {
    const { posted, store } = shown();
    const actions = store.getState();
    actions.askPack('left', ['a.txt']);
    assert.deepStrictEqual(store.getState().packing, {
      tab: '1',
      side: 'left',
      folder: left.folder,
      names: ['a.txt'],
      target: left.folder,
    });
    store.getState().receive({ ...listing('D:\\backup'), side: 'right' });
    actions.askPack('left', ['a.txt', 'docs']);
    assert.strictEqual(store.getState().packing?.target, 'D:\\backup');
    actions.pack({
      archive: 'D:\\backup\\code.7z',
      format: '7z',
      level: 'ultra',
      password: 'secret',
      encryptNames: true,
      volume: '700 MB',
      volumeBytes: 734_003_200,
      test: false,
    });
    assert.strictEqual(store.getState().packing, undefined);
    assert.deepStrictEqual(store.getState().packChoices, {
      format: '7z',
      level: 'ultra',
      zipCipher: 'aes256',
      volume: '700 MB',
      test: false,
    });
    actions.askPack('left', ['a.txt']);
    actions.cancelPack();
    actions.askPack('left', ['a.txt']);
    store.getState().receive(listing(`${left.folder}\\sub`));
    assert.strictEqual(store.getState().packing, undefined);
    store.getState().receive({
      ...listing('D:\\a.zip'),
      side: 'right',
      archive: 'D:\\a.zip',
    });
    store.getState().receive(listing(left.folder));
    actions.askPack('left', ['a.txt']);
    assert.strictEqual(store.getState().packing?.target, left.folder);

    assert.deepStrictEqual(
      posted.filter((message) => message.type === 'pack'),
      [
        {
          type: 'pack',
          tab: '1',
          side: 'left',
          folder: left.folder,
          names: ['a.txt', 'docs'],
          archive: 'D:\\backup\\code.7z',
          format: '7z',
          level: 'ultra',
          password: 'secret',
          encryptNames: true,
          volumeBytes: 734_003_200,
          test: false,
        },
      ],
    );
  });

  test('asks whether to put a copy changed since it was taken out of its archive back into it, sending the answer to that question alone', () => {
    const { posted, store } = shown();
    store.getState().receive({
      type: 'askUpdate',
      ask: 2,
      name: 'docs\\readme.md',
      archive: 'a.zip',
    });
    assert.deepStrictEqual(store.getState().askingUpdate, {
      ask: 2,
      name: 'docs\\readme.md',
      archive: 'a.zip',
    });
    store.getState().answerUpdate(true);
    store.getState().answerUpdate(false);

    assert.strictEqual(store.getState().askingUpdate, undefined);
    assert.deepStrictEqual(
      posted.filter((message) => message.type === 'updateArchive'),
      [{ type: 'updateArchive', ask: 2, update: true }],
    );
  });

  test('tests the archives named in the folder of a side on disk, and none inside an archive', () => {
    const { posted, store } = shown();
    store.getState().testArchives('left', ['a.zip', 'b.7z']);
    store.getState().receive({ ...listing('C:\\x.zip'), archive: 'C:\\x.zip' });
    store.getState().testArchives('left', ['inner.zip']);
    assert.deepStrictEqual(
      posted.filter((message) => message.type === 'testArchives'),
      [
        {
          type: 'testArchives',
          tab: '1',
          side: 'left',
          folder: left.folder,
          names: ['a.zip', 'b.7z'],
        },
      ],
    );
  });

  test('reads a folder it may not as administrator once asked, forgetting the question either way', () => {
    const { posted, store } = shown();
    const noAccess = {
      type: 'noAccess',
      side: 'left',
      folder: 'C:\\x',
      asAdministrator: true,
    } as const;
    store.getState().receive(noAccess);
    store.getState().closeNoAccess();
    assert.strictEqual(store.getState().noAccess, undefined);
    store.getState().receive(noAccess);
    store.getState().elevate();
    assert.strictEqual(store.getState().noAccess, undefined);
    assert.deepStrictEqual(posted, [
      { type: 'elevate', tab: '1', side: 'left' },
    ]);
  });
});

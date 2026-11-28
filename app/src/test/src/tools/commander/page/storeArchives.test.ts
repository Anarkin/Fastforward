import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { shown, listing } from './storeFixtures';

const fileEntry = (name: string) => ({
  name,
  folder: false,
  link: false,
  hidden: false,
  size: 1,
  modified: 0,
});

suite('The commander store in archives', () => {
  test('asks for a new name and for the name of a new folder or file inside an archive too, sending them for the folder in it, as Shift+F4 asked nothing there though the main process makes the file', () => {
    const { posted, store } = shown();
    store.getState().receive({ ...listing('C:\\a.zip'), archive: 'C:\\a.zip' });
    store.getState().askRename('left', 'a.txt');
    store.getState().rename('b.txt');
    store.getState().askNewFolder('left');
    store.getState().makeFolder('fresh');
    store.getState().askNewFile('left');
    store.getState().makeFile('new.txt');
    assert.deepStrictEqual(
      posted
        .filter(
          (message) =>
            message.type === 'rename' ||
            message.type === 'newFolder' ||
            message.type === 'newFile',
        )
        .map((message) => [message.type, message.folder]),
      [
        ['rename', 'C:\\a.zip'],
        ['newFolder', 'C:\\a.zip'],
        ['newFile', 'C:\\a.zip'],
      ],
    );
  });

  test('asks about the items there already once the host finds them, as a side listed flat inside an archive shows none of what its folder holds and a listing may be behind, sending the answer with the copy', () => {
    const { posted, store } = shown();
    const asked = {
      tab: '1',
      side: 'left',
      folder: 'D:\\x',
      names: ['top.txt'],
      target: 'C:\\a.zip',
      move: false,
    } as const;
    store.getState().receive(listing('D:\\x'));
    store.getState().receive({
      ...listing('C:\\a.zip'),
      side: 'right',
      archive: 'C:\\a.zip',
    });
    store
      .getState()
      .receive({ type: 'askExisting', ...asked, existing: ['top.txt'] });

    assert.deepStrictEqual(store.getState().transferring, {
      ...asked,
      existing: ['top.txt'],
    });
    store.getState().confirmTransfer('replace');
    assert.deepStrictEqual(
      posted.filter((message) => message.type === 'transfer'),
      [{ type: 'transfer', ...asked, existing: 'replace' }],
    );
  });

  test('asks before copying or moving items of a side on disk into the folder of an archive on the other, telling which are there already, sends the answer to replace or skip them, and from one archive into another too', () => {
    const { posted, store } = shown();
    store.getState().receive({
      ...listing('C:\\a.zip'),
      archive: 'C:\\a.zip',
      entries: [fileEntry('top.txt')],
    });
    store.getState().receive({
      ...listing('D:\\x'),
      side: 'right',
      entries: [fileEntry('top.txt'), fileEntry('new.txt')],
    });
    const actions = store.getState();
    actions.askTransfer('right', ['top.txt', 'new.txt'], true);
    assert.deepStrictEqual(store.getState().transferring, {
      tab: '1',
      side: 'right',
      folder: 'D:\\x',
      names: ['top.txt', 'new.txt'],
      target: 'C:\\a.zip',
      move: true,
      existing: ['top.txt'],
    });
    actions.confirmTransfer('skip');
    actions.askTransfer('right', ['new.txt'], false);
    assert.strictEqual(store.getState().transferring?.existing, undefined);
    actions.confirmTransfer();
    store.getState().receive({
      ...listing('D:\\b.zip'),
      side: 'right',
      archive: 'D:\\b.zip',
      entries: [fileEntry('top.txt'), fileEntry('new.txt')],
    });
    actions.askTransfer('right', ['top.txt', 'new.txt'], false);
    assert.deepStrictEqual(store.getState().transferring, {
      tab: '1',
      side: 'right',
      folder: 'D:\\b.zip',
      names: ['top.txt', 'new.txt'],
      target: 'C:\\a.zip',
      move: false,
      existing: ['top.txt'],
    });

    assert.deepStrictEqual(
      posted.filter((message) => message.type === 'transfer'),
      [
        {
          type: 'transfer',
          tab: '1',
          side: 'right',
          folder: 'D:\\x',
          names: ['top.txt', 'new.txt'],
          target: 'C:\\a.zip',
          move: true,
          existing: 'skip',
        },
        {
          type: 'transfer',
          tab: '1',
          side: 'right',
          folder: 'D:\\x',
          names: ['new.txt'],
          target: 'C:\\a.zip',
          move: false,
        },
      ],
    );
  });

  test('asks before deleting items of a side inside an archive from it, always permanently, naming the archive, and deletes them once confirmed', () => {
    const { posted, store } = shown();
    store.getState().receive({ ...listing('C:\\a.zip'), archive: 'C:\\a.zip' });
    store.getState().askDelete('left', ['docs'], false);
    assert.deepStrictEqual(store.getState().deleting, {
      tab: '1',
      side: 'left',
      folder: 'C:\\a.zip',
      names: ['docs'],
      permanently: true,
      archive: 'C:\\a.zip',
    });
    store.getState().confirmDelete();
    assert.deepStrictEqual(
      posted.filter((message) => message.type === 'delete'),
      [
        {
          type: 'delete',
          tab: '1',
          side: 'left',
          folder: 'C:\\a.zip',
          names: ['docs'],
          permanently: true,
        },
      ],
    );
  });

  test('asks and sends nothing that would change an archive or drag out of it, for a side inside one or a copy into one, sending what moves through it, reads from it, lists it flat or enters an archive in it, and the archive to enter from a folder, and asking before a copy or a move out of it', () => {
    const { posted, store } = shown();
    store.getState().receive({ ...listing('C:\\a.zip'), archive: 'C:\\a.zip' });
    store.getState().receive({ ...listing('D:\\photos'), side: 'right' });
    const before = posted.length;
    const actions = store.getState();

    actions.askPack('left', ['a.txt']);
    actions.paste('left');
    actions.drag('left', ['a.txt']);
    actions.openRepository('left', 'docs');
    actions.folderCommand('left', 'docs', 'newTerminal');
    actions.addBookmark('left');
    actions.shellMenu('left', ['a.txt'], { x: 1, y: 1 }, false);
    actions.open('left', 'docs');
    actions.enterArchive('left', 'inner.zip');
    actions.viewFile('left', 'a.txt');
    actions.copyToClipboard('left', ['a.txt']);
    actions.flat('left');
    actions.enterArchive('right', 'b.zip');

    const { deleting, transferring, packing } = store.getState();
    assert.deepStrictEqual(
      [deleting, transferring, packing],
      [undefined, undefined, undefined],
    );
    actions.askTransfer('left', ['a.txt'], false);
    assert.deepStrictEqual(store.getState().transferring, {
      tab: '1',
      side: 'left',
      folder: 'C:\\a.zip',
      names: ['a.txt'],
      target: 'D:\\photos',
      move: false,
    });
    actions.cancelTransfer();
    actions.askTransfer('left', ['a.txt'], true);
    assert.deepStrictEqual(store.getState().transferring, {
      tab: '1',
      side: 'left',
      folder: 'C:\\a.zip',
      names: ['a.txt'],
      target: 'D:\\photos',
      move: true,
    });
    assert.deepStrictEqual(posted.slice(before), [
      {
        type: 'open',
        tab: '1',
        side: 'left',
        folder: 'C:\\a.zip',
        name: 'docs',
      },
      {
        type: 'enterArchive',
        tab: '1',
        side: 'left',
        folder: 'C:\\a.zip',
        name: 'inner.zip',
      },
      {
        type: 'view',
        tab: '1',
        side: 'left',
        folder: 'C:\\a.zip',
        name: 'a.txt',
      },
      {
        type: 'copyToClipboard',
        tab: '1',
        side: 'left',
        folder: 'C:\\a.zip',
        names: ['a.txt'],
      },
      { type: 'flat', tab: '1', side: 'left', flat: true },
      {
        type: 'enterArchive',
        tab: '1',
        side: 'right',
        folder: 'D:\\photos',
        name: 'b.zip',
      },
    ]);
  });

  test('keeps how many reads each side of a tab is told it runs, forgetting the side once each is done, as a read of a folder may end while another of the side goes on', () => {
    const { store } = shown();
    const sidesRead = () => [...store.getState().readingSides];
    const told = (reading: boolean) =>
      store
        .getState()
        .receive({ type: 'reading', tab: '1', side: 'right', reading });
    told(true);
    assert.deepStrictEqual(sidesRead(), [['1 right', 1]]);
    told(true);
    told(false);
    assert.deepStrictEqual(sidesRead(), [['1 right', 1]]);
    told(false);
    assert.deepStrictEqual(sidesRead(), []);
    told(false);
    assert.deepStrictEqual(sidesRead(), []);
  });

  test('shows the password the main process asks for, sending what is typed, or nothing once cancelled, for that question alone', () => {
    const { posted, store } = shown();
    store.getState().receive({
      type: 'askPassword',
      ask: 4,
      name: 'a.zip',
      wrong: true,
    });
    assert.deepStrictEqual(store.getState().askingPassword, {
      ask: 4,
      name: 'a.zip',
      wrong: true,
    });
    store.getState().answerPassword(' with spaces ');
    assert.strictEqual(store.getState().askingPassword, undefined);
    store.getState().answerPassword('again');
    store.getState().receive({
      type: 'askPassword',
      ask: 5,
      name: 'a.zip',
      wrong: false,
    });
    store.getState().answerPassword(undefined);
    assert.deepStrictEqual(
      posted.filter((message) => message.type === 'password'),
      [
        { type: 'password', ask: 4, password: ' with spaces ' },
        { type: 'password', ask: 5 },
      ],
    );
  });
});

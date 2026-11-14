import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import type {
  CommanderToHost,
  CommanderToWebview,
  CommanderToWebviewOf,
  Entry,
  FlatFolder,
} from '../../../../../tools/commander/shared/protocol';
import { FlatSorter } from '../../../../../tools/commander/page/flatOrder';
import type {
  FromFlatWorker,
  ToFlatWorker,
} from '../../../../../tools/commander/page/flatMessages';
import { shownRowsOf } from '../../../../../tools/commander/page/shownRows';
import { createCommanderStore } from '../../../../../tools/commander/page/store';
import { emptyView } from '../../../../../tools/commander/page/view';
import { left, shown, listing } from './storeFixtures';

const file = (name: string, extra: Partial<Entry> = {}): Entry => ({
  name,
  folder: false,
  link: false,
  hidden: false,
  size: 1,
  modified: 0,
  ...extra,
});

const reading = { reading: true, stopped: false, folders: 1, failed: 0 };

const flatFiles = (
  folders: readonly FlatFolder[],
  extra: Partial<CommanderToWebviewOf<'flatFiles'>> = {},
): CommanderToWebview => ({
  type: 'flatFiles',
  tab: '1',
  side: 'left',
  folder: left.folder,
  walk: 1,
  folders,
  progress: reading,
  ...extra,
});

function flat() {
  const posted: CommanderToHost[] = [];
  const told: ToFlatWorker[] = [];
  const listeners: ((event: { readonly data: FromFlatWorker }) => void)[] = [];
  const pending: (() => void)[] = [];
  const sorter = new FlatSorter(
    (answer) => {
      for (const listener of listeners) {
        listener({ data: answer });
      }
    },
    (run) => pending.push(run),
  );
  const clock = { now: 0 };
  const store = createCommanderStore(
    (message) => posted.push(message),
    {
      view: {
        ...emptyView,
        tab: '1',
        sorts: {
          left: { column: 'name', descending: false, groupByColor: false },
          right: emptyView.sorts.right,
        },
        panes: { left, right: undefined },
      },
    },
    {
      worker: () => ({
        postMessage: (message) => {
          told.push(message);
          sorter.receive(message);
        },
        addEventListener: (_type, listener) => listeners.push(listener),
      }),
      timing: { now: () => clock.now, later: (run) => run() },
    },
  );
  const sort = () => {
    for (const run of pending.splice(0)) {
      run();
    }
    clock.now += 1000;
  };
  const keys = () =>
    shownRowsOf(store.getState(), 'left').rows.map((row) => row.key);
  store.getState().receive({ ...listing(left.folder), flat: 1 });
  return { store, posted, told, sort, keys };
}

suite('The commander store in flat view', () => {
  test('shows the files of a flat side in the order the worker sorts them, and how far the reading got', () => {
    const { store, sort, keys } = flat();
    const { receive } = store.getState();

    receive(
      flatFiles([
        { under: '', entries: [file('b.txt')] },
        { under: 'sub/', entries: [file('a.txt')] },
      ]),
    );
    sort();

    assert.deepStrictEqual(keys(), ['..', 'sub/a.txt', 'b.txt']);
    assert.deepStrictEqual(
      store.getState().view.panes.left?.flat?.progress,
      reading,
    );
    const { files, total } = shownRowsOf(store.getState(), 'left');
    assert.deepStrictEqual([files, total], [2, 2]);
  });

  test('filters a flat side through the worker, counting the files shown and read', () => {
    const { store, sort, keys } = flat();
    const { receive, filterSide } = store.getState();
    receive(
      flatFiles([
        { under: '', entries: [file('cat.jpg'), file('dog.jpg')] },
        { under: 'more/', entries: [file('cat.png')] },
      ]),
    );
    sort();

    filterSide('left', 'cat');
    assert.deepStrictEqual(keys(), [
      '..',
      'cat.jpg',
      'dog.jpg',
      'more/cat.png',
    ]);
    sort();

    assert.deepStrictEqual(keys(), ['..', 'cat.jpg', 'more/cat.png']);
    const { files, total } = shownRowsOf(store.getState(), 'left');
    assert.deepStrictEqual([files, total], [2, 3]);
    assert.strictEqual(
      shownRowsOf(store.getState(), 'left'),
      shownRowsOf(store.getState(), 'left'),
    );

    filterSide('left', undefined);
    assert.deepStrictEqual(keys(), [
      '..',
      'cat.jpg',
      'dog.jpg',
      'more/cat.png',
    ]);
  });

  test('sorts a flat side again through the worker once its sort or the hidden files change', () => {
    const { store, sort, keys } = flat();
    const { receive, sort: sortBy } = store.getState();
    receive(
      flatFiles([
        {
          under: '',
          entries: [file('a.txt', { size: 1 }), file('b.txt', { size: 9 })],
        },
        { under: 'x/', entries: [file('.hidden', { hidden: true, size: 5 })] },
      ]),
    );
    sort();

    sortBy('left', 'size');
    sort();
    assert.deepStrictEqual(keys(), ['..', 'a.txt', 'x/.hidden', 'b.txt']);

    receive({
      type: 'settings',
      showHidden: false,
      sort: {
        left: { column: 'size', descending: false, groupByColor: false },
        right: emptyView.sorts.right,
      },
      columns: emptyView.columns,
      defaultColumns: emptyView.defaultColumns,
      canElevate: false,
      platform: 'win32',
      thumbnailSize: 144,
      fileColors: [],
      bookmarks: [],
    });
    sort();
    assert.deepStrictEqual(keys(), ['..', 'a.txt', 'b.txt']);
  });

  test('takes no files for another walk or folder', () => {
    const { store, sort, keys } = flat();
    const { receive } = store.getState();

    receive(
      flatFiles([{ under: '', entries: [file('old.txt')] }], { walk: 0 }),
    );
    receive(
      flatFiles([{ under: '', entries: [file('else.txt')] }], {
        folder: 'D:\\',
      }),
    );
    sort();

    assert.deepStrictEqual(keys(), ['..']);
  });

  test('turns flat view on and off and stops the reading on the side asked, for the tab shown', () => {
    const { store, posted } = flat();
    const { flat: turnFlat, stopReading } = store.getState();

    turnFlat('left');
    turnFlat('right');
    stopReading('left');

    assert.deepStrictEqual(posted.slice(-3), [
      { type: 'flat', tab: '1', side: 'left', flat: false },
      { type: 'flat', tab: '1', side: 'right', flat: true },
      { type: 'stopReading', tab: '1', side: 'left' },
    ]);
  });

  test('forgets the files of a side no longer flat, and of a flat side of a tab closed, keeping those of a tab shown away', () => {
    const { store, told } = flat();
    const { receive } = store.getState();
    const drops = () => told.filter((message) => message.type === 'drop');

    receive({ type: 'show', tab: '2' });
    assert.deepStrictEqual(drops(), []);
    receive({ type: 'show', tab: '1' });
    receive(listing(left.folder));
    assert.deepStrictEqual(drops().length, 1);

    receive({ ...listing(left.folder), flat: 2 });
    receive({ type: 'show', tab: '2' });
    receive({ type: 'closed', tab: '1' });
    assert.deepStrictEqual(drops().length, 2);
  });
});

const fileEntry = (name: string) => ({
  name,
  folder: false,
  link: false,
  hidden: false,
  size: 1,
  modified: 0,
});

suite('The commander store in archives', () => {
  test('asks for a new name and for the name of a new folder inside an archive too, sending them for the folder in it', () => {
    const { posted, store } = shown();
    store.getState().receive({ ...listing('C:\\a.zip'), archive: 'C:\\a.zip' });
    store.getState().askRename('left', 'a.txt');
    store.getState().rename('b.txt');
    store.getState().askNewFolder('left');
    store.getState().makeFolder('fresh');
    assert.deepStrictEqual(
      posted
        .filter(
          (message) =>
            message.type === 'rename' || message.type === 'newFolder',
        )
        .map((message) => [message.type, message.folder]),
      [
        ['rename', 'C:\\a.zip'],
        ['newFolder', 'C:\\a.zip'],
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

  test('keeps the archive each side of a tab is reading while the page is told so, forgetting it once it is done', () => {
    const { store } = shown();
    const archivesRead = () => [...store.getState().readingArchives];
    store.getState().receive({
      type: 'readingArchive',
      tab: '1',
      side: 'right',
      name: 'big.tar.gz',
    });
    assert.deepStrictEqual(archivesRead(), [['1 right', 'big.tar.gz']]);
    store
      .getState()
      .receive({ type: 'readingArchive', tab: '1', side: 'right' });
    assert.deepStrictEqual(archivesRead(), []);
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

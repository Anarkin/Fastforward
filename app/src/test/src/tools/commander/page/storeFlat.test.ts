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
import { left, listing } from './storeFixtures';

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

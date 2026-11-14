import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import type { CommanderToHost } from '../../../../../tools/commander/shared/protocol';
import { maxDroppedIcons } from '../../../../../tools/commander/shared/icons';
import {
  filterOf,
  shownColumns,
  shownRowsOf,
} from '../../../../../tools/commander/page/shownRows';
import { createCommanderStore } from '../../../../../tools/commander/page/store';
import { nextSort } from '../../../../../tools/commander/page/listing';
import { emptyView } from '../../../../../tools/commander/page/view';
import { noop } from '../../../../helpers/fixtures';
import {
  left,
  shown,
  listing,
  withFiles,
  byName,
  selectedOf,
} from './storeFixtures';

suite('Commander store', () => {
  test('opens the filter of a side whose folder is not listed yet, forgetting it once the folder comes, as the filter belongs to a folder', () => {
    const store = createCommanderStore(noop, {
      view: { ...emptyView, tab: '1' },
    });
    store.getState().filterSide('left', '');
    assert.strictEqual(filterOf(store.getState(), 'left'), '');
    store.getState().receive(listing(left.folder));
    assert.strictEqual(filterOf(store.getState(), 'left'), undefined);
  });

  test('keeps the filter of each side of a tab while it shows the folder the filter was typed in, through another tab shown, forgetting it once the side shows another folder or the tab closes', () => {
    const { store } = shown();
    const filtered = () => filterOf(store.getState(), 'left');
    store.getState().filterSide('left', 'png');
    assert.strictEqual(filtered(), 'png');
    assert.strictEqual(filterOf(store.getState(), 'right'), undefined);
    store.getState().receive({ type: 'show', tab: '2' });
    store.getState().receive(listing(left.folder, '2'));
    assert.strictEqual(filtered(), undefined);
    store.getState().receive({ type: 'show', tab: '1' });
    assert.strictEqual(filtered(), 'png');
    store.getState().receive(listing(`${left.folder}/src`));
    store.getState().receive(listing(left.folder));
    assert.strictEqual(filtered(), undefined);
    store.getState().filterSide('left', 'jpg');
    store.getState().receive({ type: 'closed', tab: '1' });
    store.getState().receive({ type: 'show', tab: '1' });
    store.getState().receive(listing(left.folder));
    assert.strictEqual(filtered(), undefined);
    store.getState().filterSide('left', 'gif');
    store.getState().filterSide('left', undefined);
    assert.strictEqual(filtered(), undefined);
  });

  test('filters the rows of a side once for each change of its rows or its filter, counting the files shown and listed', () => {
    const store = byName();
    const { receive, filterSide, select } = store.getState();
    receive(withFiles(left.folder, 'a.txt', 'b.log', 'c.txt'));
    const all = shownRowsOf(store.getState(), 'left');
    assert.strictEqual(all.rows, store.getState().view.panes.left?.rows);
    assert.strictEqual(shownRowsOf(store.getState(), 'left'), all);

    filterSide('left', 'txt');
    const filtered = shownRowsOf(store.getState(), 'left');
    select('left', 'c.txt');

    assert.deepStrictEqual(
      filtered.rows.map((row) => row.key),
      ['..', 'a.txt', 'c.txt'],
    );
    assert.deepStrictEqual([filtered.files, filtered.total], [2, 3]);
    assert.strictEqual(shownRowsOf(store.getState(), 'left'), filtered);
  });

  test('shows only the files of a side that have a copy while it shows duplicates, grouped in the order of the side and after its filter, once for each change of its rows or groups', () => {
    const store = byName();
    const { receive, filterSide } = store.getState();
    receive({
      ...withFiles(left.folder, 'a.txt', 'b.log', 'c.txt', 'd.txt'),
      duplicates: 1,
    });
    receive({
      type: 'duplicateGroups',
      tab: '1',
      side: 'left',
      folder: left.folder,
      look: 1,
      groups: [
        ['d.txt', 'b.log'],
        ['c.txt', 'a.txt'],
      ],
      reading: false,
    });
    const grouped = shownRowsOf(store.getState(), 'left');
    const again = shownRowsOf(store.getState(), 'left');
    filterSide('left', 'txt');
    const filtered = shownRowsOf(store.getState(), 'left');

    assert.deepStrictEqual(
      grouped.rows.map((row) => row.key),
      ['..', 'a.txt', 'c.txt', 'b.log', 'd.txt'],
    );
    assert.deepStrictEqual([...(grouped.starts ?? [])], ['a.txt', 'b.log']);
    assert.strictEqual(again, grouped);
    assert.deepStrictEqual(
      filtered.rows.map((row) => row.key),
      ['..', 'a.txt', 'c.txt'],
    );
  });

  test('asks for a pattern to mark the files and folders of a side by, from the last pattern used, marking or unmarking those the side shows that match it, and nothing once cancelled or the side shows another folder', () => {
    const store = byName();
    const { receive, filterSide } = store.getState();
    receive(withFiles(left.folder, 'a.jpg', 'b.png', 'c.jpg'));
    const marked = () => [...(store.getState().view.panes.left?.marked ?? [])];
    const actions = () => store.getState();

    actions().askMarkPattern('left', true, '*.png');
    const asked = actions().markingPattern;
    actions().markPattern('*.jpg');
    const afterMark = marked();
    actions().askMarkPattern('left', false, '*.png');
    const fromLast = actions().markingPattern?.initial;
    actions().markPattern('a*');
    const afterUnmark = marked();
    actions().askMarkPattern('left', true, '*');
    filterSide('left', 'b');
    actions().markPattern('*');
    const filtered = marked();
    filterSide('left', undefined);
    actions().askMarkPattern('left', true, '*');
    actions().cancelMarkPattern();
    actions().markPattern('*');
    const afterCancel = marked();
    actions().askMarkPattern('left', true, '*');
    receive(withFiles(`${left.folder}/sub`, 'd.jpg'));

    assert.deepStrictEqual(asked, {
      tab: '1',
      side: 'left',
      folder: left.folder,
      mark: true,
      initial: '*.png',
    });
    assert.deepStrictEqual(afterMark, ['a.jpg', 'c.jpg']);
    assert.strictEqual(fromLast, '*.jpg');
    assert.deepStrictEqual(afterUnmark, ['c.jpg']);
    assert.deepStrictEqual(filtered.toSorted(), ['b.png', 'c.jpg']);
    assert.deepStrictEqual(afterCancel.toSorted(), ['b.png', 'c.jpg']);
    assert.strictEqual(actions().markingPattern, undefined);
  });

  test('selects the nearest file shown once the duplicates found leave out the one selected, keeping it while none are found yet, as no row was selected and the keys for files did nothing', () => {
    const store = byName();
    const { receive, select } = store.getState();
    const files = withFiles(left.folder, 'a.txt', 'b.log', 'c.txt', 'd.txt');
    receive(files);
    select('left', 'b.log');
    receive({ ...files, duplicates: 1 });
    const whileReading = selectedOf(store);
    receive({
      type: 'duplicateGroups',
      tab: '1',
      side: 'left',
      folder: left.folder,
      look: 1,
      groups: [['c.txt', 'd.txt']],
      reading: false,
    });

    assert.strictEqual(whileReading, 'b.log');
    assert.strictEqual(selectedOf(store), 'c.txt');
  });

  test('asks to show the duplicates of a side, and every file again once it shows them', () => {
    const { posted, store } = shown();
    store.getState().duplicates('left');
    store.getState().receive({ ...listing(left.folder), duplicates: 1 });
    store.getState().duplicates('left');

    assert.deepStrictEqual(
      posted.filter((message) => message.type === 'duplicates'),
      [
        { type: 'duplicates', tab: '1', side: 'left', duplicates: true },
        { type: 'duplicates', tab: '1', side: 'left', duplicates: false },
      ],
    );
  });

  test('selects the first file the filter shows as it is typed, keeping the one selected while the filter shows it', () => {
    const store = byName();
    const { receive, filterSide, select } = store.getState();
    receive(withFiles(left.folder, 'a.txt', 'b.log', 'c.txt'));
    select('left', '..');
    filterSide('left', '');
    assert.strictEqual(selectedOf(store), '..');
    filterSide('left', 'log');
    assert.strictEqual(selectedOf(store), 'b.log');
    filterSide('left', 'lo');
    assert.strictEqual(selectedOf(store), 'b.log');
    filterSide('left', 'txt');
    assert.strictEqual(selectedOf(store), 'a.txt');
    filterSide('left', undefined);
    assert.strictEqual(selectedOf(store), 'a.txt');
  });

  test('selects the nearest file the filter shows once the folder is listed again without the one selected, as the selection fell on a file the filter hid, where Delete did nothing', () => {
    const store = byName();
    const { receive, filterSide, select } = store.getState();
    receive(withFiles(left.folder, 'a.txt', 'b.log', 'c.txt'));
    filterSide('left', 'txt');
    select('left', 'a.txt');

    receive(withFiles(left.folder, 'b.log', 'c.txt'));
    assert.strictEqual(selectedOf(store), 'c.txt');

    receive(withFiles(left.folder, 'a.txt', 'b.log', 'c.txt'));
    select('left', 'c.txt');
    receive(withFiles(left.folder, 'a.txt', 'b.log'));
    assert.strictEqual(selectedOf(store), 'a.txt');
  });

  test('keeps where each list of a side was scrolled to, apart from the lists of another store', () => {
    const store = createCommanderStore(noop);
    assert.strictEqual(store.getState().scrollOf('left /work'), 0);
    store.getState().keepScroll('left /work', 120);
    assert.strictEqual(store.getState().scrollOf('left /work'), 120);
    assert.strictEqual(store.getState().scrollOf('right /work'), 0);
    assert.strictEqual(
      createCommanderStore(noop).getState().scrollOf('left /work'),
      0,
    );
  });

  test('opens, steps, views and reads again on the side asked, for the tab shown, and nothing before a tab is shown', () => {
    const empty: CommanderToHost[] = [];
    createCommanderStore((message) => empty.push(message))
      .getState()
      .open('left', 'a');
    assert.deepStrictEqual(empty, []);
    const { posted, store } = shown();
    const actions = store.getState();
    actions.open('left', 'a');
    actions.step('left', -1);
    actions.viewFile('left', 'a.txt');
    actions.openRepository('left', 'repo');
    actions.openOnSide('left', 'right', 'a');
    actions.drive('left', 'D:');
    actions.listDrives();
    actions.reread();
    actions.toggleHidden();
    assert.deepStrictEqual(posted, [
      { type: 'open', tab: '1', side: 'left', folder: left.folder, name: 'a' },
      { type: 'step', tab: '1', side: 'left', step: -1 },
      {
        type: 'view',
        tab: '1',
        side: 'left',
        folder: left.folder,
        name: 'a.txt',
      },
      {
        type: 'openRepository',
        tab: '1',
        side: 'left',
        folder: left.folder,
        name: 'repo',
      },
      {
        type: 'openOnSide',
        tab: '1',
        from: 'left',
        side: 'right',
        folder: left.folder,
        name: 'a',
      },
      { type: 'drive', tab: '1', side: 'left', drive: 'D:' },
      { type: 'listDrives' },
      { type: 'reread', tab: '1', side: 'right' },
      { type: 'showHidden', shown: false },
    ]);
  });

  test('asks to count the sizes of folders of a side on disk, and of none inside an archive, where they are known', () => {
    const { posted, store } = shown();
    store.getState().countSizes('left', ['docs', 'src']);
    store.setState({
      view: {
        ...emptyView,
        tab: '1',
        panes: { left: { ...left, archive: 'C:\\a.zip' }, right: undefined },
      },
    });
    store.getState().countSizes('left', ['docs']);
    assert.deepStrictEqual(posted, [
      {
        type: 'countSizes',
        tab: '1',
        side: 'left',
        folder: left.folder,
        names: ['docs', 'src'],
      },
    ]);
  });

  test('bookmarks the folder of a side, removes a bookmark and goes to one on the side asked, for the tab shown, and goes nowhere before a tab is shown', () => {
    const empty: CommanderToHost[] = [];
    const unshown = createCommanderStore((message) => empty.push(message));
    unshown.getState().addBookmark('left');
    unshown.getState().goToBookmark('left', 'D:\\Work');
    assert.deepStrictEqual(empty, []);
    const { posted, store } = shown();
    const actions = store.getState();
    actions.addBookmark('left');
    actions.addBookmark('right');
    actions.removeBookmark('D:\\Work');
    actions.goToBookmark('left', 'D:\\Work');
    assert.deepStrictEqual(posted, [
      { type: 'addBookmark', tab: '1', side: 'left', folder: left.folder },
      { type: 'removeBookmark', folder: 'D:\\Work' },
      { type: 'goToBookmark', tab: '1', side: 'left', folder: 'D:\\Work' },
    ]);
  });

  test('tells the main process which side of which tab is active whenever either changes', () => {
    const posted: CommanderToHost[] = [];
    const store = createCommanderStore((message) => posted.push(message));
    store.getState().receive({ type: 'show', tab: '1' });
    store.getState().activate('left');
    store.getState().activate('left');
    store.getState().switchSide();
    assert.strictEqual(store.getState().view.active, 'right');
    assert.deepStrictEqual(posted, [
      { type: 'activate', tab: '1', side: 'right' },
      { type: 'activate', tab: '1', side: 'left' },
      { type: 'activate', tab: '1', side: 'right' },
    ]);
  });

  test('sorts a side by the column clicked and groups it by color at once, telling the main process', () => {
    const { posted, store } = shown();
    const sorted = nextSort(left.sort, 'size');
    store.getState().sort('left', 'size');
    assert.deepStrictEqual(store.getState().view.panes.left?.sort, sorted);
    store.getState().groupByColor('left');
    const grouped = { ...sorted, groupByColor: true };
    assert.deepStrictEqual(store.getState().view.panes.left?.sort, grouped);
    assert.deepStrictEqual(posted, [
      { type: 'sort', side: 'left', sort: sorted },
      { type: 'sort', side: 'left', sort: grouped },
    ]);
  });

  test('widens a column on the page alone while it is dragged, saving its width once let go and its default width on a reset, and drops the drag once the saved widths change', () => {
    const { posted, store } = shown();
    const { columns, defaultColumns } = emptyView;
    store.getState().resizeColumn('size', 20);
    assert.deepStrictEqual(shownColumns(store.getState()), {
      ...columns,
      size: 20,
    });
    store.getState().saveColumn('size', 20);
    store.getState().resetColumn('date');
    assert.deepStrictEqual(posted, [
      { type: 'columns', columns: { ...columns, size: 20 } },
      { type: 'columns', columns: { ...columns, date: defaultColumns.date } },
    ]);
    const saved = { ...columns, size: 21 };
    store.setState({ view: { ...store.getState().view, columns: saved } });
    assert.strictEqual(shownColumns(store.getState()), saved);
  });

  test('hands the icons dropped in one turn to the main process together, in batches', async () => {
    const { posted, store } = shown();
    const tickets = Array.from(
      { length: maxDroppedIcons + 1 },
      (_, index) => `${index}`,
    );
    for (const ticket of tickets) {
      store.getState().dropIcon(ticket);
    }
    assert.deepStrictEqual(posted, []);
    await Promise.resolve();
    assert.deepStrictEqual(posted, [
      { type: 'dropIcons', tickets: tickets.slice(0, maxDroppedIcons) },
      { type: 'dropIcons', tickets: tickets.slice(maxDroppedIcons) },
    ]);
  });

  test('saves a thumbnail made of a file for the folder it was made in, though its side shows another by the time it is made, so the main process takes it for no other file', async () => {
    const { posted, store } = shown();
    await store
      .getState()
      .saveThumbnail(
        { tab: '1', side: 'left', folder: 'C:\\albums\\a', name: 'a.png' },
        64,
        2,
        new Blob([new Uint8Array([1, 2])]),
      );
    assert.deepStrictEqual(posted, [
      {
        type: 'saveThumbnail',
        tab: '1',
        side: 'left',
        folder: 'C:\\albums\\a',
        name: 'a.png',
        box: 64,
        pixelRatio: 2,
        bytes: new Uint8Array([1, 2]),
      },
    ]);
  });

  test('is made in the state it is given, as a page rendered to a string shows that state', () => {
    assert.deepStrictEqual(
      createCommanderStore(noop, { drives: ['C:'] }).getInitialState().drives,
      ['C:'],
    );
  });
});

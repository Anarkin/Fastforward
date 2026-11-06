import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import type { CommanderToHost } from '../../../../tools/commander/shared/protocol';
import { maxDroppedIcons } from '../../../../tools/commander/shared/icons';
import {
  createCommanderStore,
  shownColumns,
} from '../../../../tools/commander/page/store';
import { nextSort } from '../../../../tools/commander/page/listing';
import {
  emptyView,
  type PaneView,
} from '../../../../tools/commander/page/view';
import { noop } from '../../../fixtures';

const left: PaneView = {
  folder: 'C:\\code',
  hidden: [],
  entries: [],
  parent: true,
  back: false,
  forward: false,
  elevated: false,
  sort: { column: 'extension', descending: false, groupByColor: false },
  rows: [],
  selected: undefined,
  marked: new Set(),
  repositories: new Set(),
};

function shown() {
  const posted: CommanderToHost[] = [];
  const store = createCommanderStore((message) => posted.push(message), {
    view: { ...emptyView, tab: '1', panes: { left, right: undefined } },
  });
  return { posted, store };
}

suite('Commander store', () => {
  test('applies the messages of the main process to its view through the view reducer, keeping the drives, what the viewer shows and a folder it may not read, and leaves the streams of the viewer to its listeners', () => {
    const store = createCommanderStore(noop);
    const { receive } = store.getState();
    receive({ type: 'show', tab: '1' });
    receive({ type: 'drives', drives: ['C:', 'D:'] });
    receive({ type: 'viewing', tab: '1', size: 10, binary: true });
    receive({
      type: 'noAccess',
      side: 'left',
      folder: 'C:\\System Volume Information',
      asAdministrator: true,
    });
    const state = store.getState();
    assert.strictEqual(state.view.tab, '1');
    assert.deepStrictEqual(state.drives, ['C:', 'D:']);
    assert.deepStrictEqual(state.viewed, { tab: '1', size: 10, binary: true });
    assert.deepStrictEqual(state.noAccess, {
      side: 'left',
      folder: 'C:\\System Volume Information',
      asAdministrator: true,
    });
    receive({ type: 'text', tab: '1', request: 1, text: 'text' });
    assert.strictEqual(store.getState(), state);
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
      { type: 'open', tab: '1', side: 'left', name: 'a' },
      { type: 'step', tab: '1', side: 'left', step: -1 },
      { type: 'view', tab: '1', side: 'left', name: 'a.txt' },
      { type: 'openRepository', tab: '1', side: 'left', name: 'repo' },
      { type: 'openOnSide', tab: '1', from: 'left', side: 'right', name: 'a' },
      { type: 'drive', tab: '1', side: 'left', drive: 'D:' },
      { type: 'listDrives' },
      { type: 'reread', tab: '1', side: 'right' },
      { type: 'showHidden', shown: false },
    ]);
  });

  test('activates a side and switches sides on the page alone', () => {
    const { posted, store } = shown();
    store.getState().activate('left');
    assert.strictEqual(store.getState().view.active, 'left');
    store.getState().switchSide();
    assert.strictEqual(store.getState().view.active, 'right');
    assert.deepStrictEqual(posted, []);
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

  test('asks before deleting, deleting once confirmed and nothing once cancelled', () => {
    const { posted, store } = shown();
    store.getState().askDelete('left', ['a'], true);
    assert.deepStrictEqual(store.getState().deleting, {
      tab: '1',
      side: 'left',
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
        names: ['b'],
        permanently: false,
      },
    ]);
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

  test('saves a thumbnail made of a file for the folder of its side', async () => {
    const { posted, store } = shown();
    await store
      .getState()
      .saveThumbnail(
        'left',
        'a.png',
        64,
        2,
        new Blob([new Uint8Array([1, 2])]),
      );
    assert.deepStrictEqual(posted, [
      {
        type: 'saveThumbnail',
        tab: '1',
        side: 'left',
        folder: 'C:\\code',
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

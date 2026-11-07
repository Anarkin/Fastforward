import * as assert from 'node:assert';
import { suite, test, vi } from 'vitest';
import type { CommanderToHost } from '../../../../tools/commander/shared/protocol';
import { maxDroppedIcons } from '../../../../tools/commander/shared/icons';
import {
  createCommanderStore,
  filterOf,
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

const listing = (folder: string, tab = '1') =>
  ({
    type: 'listing',
    tab,
    side: 'left',
    folder,
    hidden: [],
    entries: [],
    parent: true,
    back: false,
    forward: false,
    elevated: false,
    selected: undefined,
  }) as const;

const place = { page: 2, zoom: 'auto', left: 0, top: 10 } as const;

suite('Commander store', () => {
  test('finds a text in a viewed file, handing on only what is found for that search, until it is stopped', () => {
    const { posted, store } = shown();
    const found: (readonly unknown[])[] = [];
    const stop = store
      .getState()
      .findText('3', 'utf-8', 'needle', ({ matches }) => found.push(matches));
    const [ask] = posted;
    assert.ok(ask?.type === 'findText');
    assert.deepStrictEqual(
      { tab: ask.tab, encoding: ask.encoding, query: ask.query },
      { tab: '3', encoding: 'utf-8', query: 'needle' },
    );
    const answer = {
      type: 'found',
      tab: '3',
      matches: [{ start: 1, end: 7 }],
      capped: false,
      done: true,
    } as const;
    store.getState().receive({ ...answer, request: ask.request + 1 });
    store.getState().receive({ ...answer, tab: '4', request: ask.request });
    store.getState().receive({ ...answer, request: ask.request });
    stop();
    store.getState().receive({ ...answer, request: ask.request });
    assert.deepStrictEqual(found, [[{ start: 1, end: 7 }]]);
    assert.deepStrictEqual(posted.at(-1), {
      type: 'stopFind',
      tab: '3',
      request: ask.request,
    });
  });

  test('reads where a PDF was left, giving up after a while without an answer', async () => {
    const { posted, store } = shown();
    const asked = store.getState().readPdfPlace('3', 'pdf-a');
    const [ask] = posted;
    assert.ok(ask?.type === 'readPdfPlace');
    store
      .getState()
      .receive({ type: 'pdfPlace', tab: '3', request: ask.request, place });
    assert.deepStrictEqual(await asked, place);
    vi.useFakeTimers();
    try {
      const unanswered = store.getState().readPdfPlace('3', 'pdf-b');
      vi.advanceTimersByTime(2000);
      assert.strictEqual(await unanswered, undefined);
    } finally {
      vi.useRealTimers();
    }
  });

  test('saves where a PDF is at most once a second, the last place kept, and at once when the PDF closes', () => {
    const { posted, store } = shown();
    vi.useFakeTimers();
    try {
      const { keepPdfPlace, flushPdfPlace } = store.getState();
      keepPdfPlace('3', 'pdf-a', { ...place, page: 1 });
      keepPdfPlace('3', 'pdf-a', place);
      assert.deepStrictEqual(posted, []);
      vi.advanceTimersByTime(1000);
      keepPdfPlace('3', 'pdf-a', { ...place, page: 5 });
      flushPdfPlace();
      flushPdfPlace();
    } finally {
      vi.useRealTimers();
    }
    assert.deepStrictEqual(posted, [
      { type: 'savePdfPlace', tab: '3', fingerprint: 'pdf-a', place },
      {
        type: 'savePdfPlace',
        tab: '3',
        fingerprint: 'pdf-a',
        place: { ...place, page: 5 },
      },
    ]);
  });

  test('keeps where each viewer tab was in its file, forgetting it once the tab closes, as a tab opened later can take its id', () => {
    const { store } = shown();
    assert.strictEqual(store.getState().placeOf('3'), 0);
    store.getState().keepPlace('3', 4096);
    assert.strictEqual(store.getState().placeOf('3'), 4096);
    assert.strictEqual(store.getState().placeOf('4'), 0);
    store.getState().receive({ type: 'closed', tab: '3' });
    assert.strictEqual(store.getState().placeOf('3'), 0);
  });

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

  test('asks the main process for what the viewer reads, handing the replies to its listeners until each stops listening', () => {
    const { posted, store } = shown();
    const heard: string[] = [];
    const stop = store
      .getState()
      .listenViewer((message) => heard.push(message.type));
    store
      .getState()
      .request({ type: 'readText', tab: '1', encoding: 'utf-8', request: 1 });
    store.getState().receive({ type: 'text', tab: '1', request: 1, text: 'x' });
    stop();
    store.getState().receive({ type: 'text', tab: '1', request: 2, text: 'y' });
    assert.deepStrictEqual(heard, ['text']);
    assert.deepStrictEqual(posted, [
      { type: 'readText', tab: '1', encoding: 'utf-8', request: 1 },
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

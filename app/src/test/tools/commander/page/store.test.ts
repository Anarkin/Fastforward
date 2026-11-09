import * as assert from 'node:assert';
import { suite, test, vi } from 'vitest';
import type {
  CommanderToHost,
  CommanderToWebview,
  CommanderToWebviewOf,
  Entry,
  FlatFolder,
} from '../../../../tools/commander/shared/protocol';
import { FlatSorter } from '../../../../tools/commander/page/flatOrder';
import type {
  FromFlatWorker,
  ToFlatWorker,
} from '../../../../tools/commander/page/flatMessages';
import { maxDroppedIcons } from '../../../../tools/commander/shared/icons';
import {
  createCommanderStore,
  filterOf,
  shownColumns,
  shownRowsOf,
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

const withFiles = (folder: string, ...names: string[]) => ({
  ...listing(folder),
  entries: names.map((name) => ({
    name,
    folder: false,
    link: false,
    hidden: false,
    size: 1,
    modified: 0,
  })),
});

function byName() {
  return createCommanderStore(noop, {
    view: {
      ...emptyView,
      tab: '1',
      panes: {
        left: { ...left, sort: { ...left.sort, column: 'name' } },
        right: undefined,
      },
    },
  });
}

const selectedOf = (store: ReturnType<typeof byName>) =>
  store.getState().view.panes.left?.selected;

suite('Commander store', () => {
  test('asks to compare no files when no two files are marked or selected, so the app says how to pick them rather than doing nothing', () => {
    const { posted, store } = shown();
    store.getState().compare();
    assert.deepStrictEqual(posted, [{ type: 'compare', tab: '1', files: [] }]);
  });

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

  test('reads the whole text of a viewed file, taking only the answer to that ask, as an answer to an earlier ask is in another encoding', () => {
    const { posted, store } = shown();
    const read: string[] = [];
    store.getState().readWholeText('3', 'utf-8', (text) => read.push(text));
    const stop = store
      .getState()
      .readWholeText('3', 'windows-1252', (text) => read.push(text));
    const asks = posted.filter((message) => message.type === 'readText');
    const [first, second] = asks;
    assert.ok(first?.type === 'readText' && second?.type === 'readText');
    assert.notStrictEqual(first.request, second.request);
    store.getState().receive({
      type: 'text',
      tab: '3',
      request: second.request,
      text: 'b',
    });
    stop();
    store.getState().receive({
      type: 'text',
      tab: '3',
      request: second.request,
      text: 'c',
    });
    assert.deepStrictEqual(read, ['b']);
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

  test('keeps what the viewer shows when the main process tells it again unchanged, as every telling read, found and colored the whole file anew', () => {
    const store = createCommanderStore(noop);
    const { receive } = store.getState();
    const viewing = (version: string, hidden: readonly boolean[]) =>
      receive({
        type: 'viewing',
        tab: '1',
        size: 10,
        version,
        binary: false,
        hidden,
        detected: 'utf-16le',
      });
    viewing('1', [false, true]);
    const state = store.getState();

    viewing('1', [false, true]);
    assert.strictEqual(store.getState(), state);

    viewing('1', [false, false]);
    assert.deepStrictEqual(store.getState().viewed?.hidden, [false, false]);
    viewing('2', [false, false]);
    assert.strictEqual(store.getState().viewed?.version, '2');
    receive({ type: 'viewing', tab: '1', size: undefined, error: 'Gone' });
    assert.strictEqual(store.getState().viewed?.error, 'Gone');
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

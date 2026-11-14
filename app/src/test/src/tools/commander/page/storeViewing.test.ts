import * as assert from 'node:assert';
import { suite, test, vi } from 'vitest';
import { maxFindLength } from '../../../../../tools/commander/shared/protocol';
import { createCommanderStore } from '../../../../../tools/commander/page/store';
import { noop } from '../../../../helpers/fixtures';
import { shown, place } from './storeFixtures';

suite('Commander store', () => {
  test('asks to compare no files when no two files are marked or selected, so the app says how to pick them rather than doing nothing', () => {
    const { posted, store } = shown();
    store.getState().compare();
    assert.deepStrictEqual(posted, [{ type: 'compare', tab: '1', files: [] }]);
  });

  test('finds nothing in a viewed file for a text longer than the main process searches for, saying so at once rather than searching for ever', () => {
    const { posted, store } = shown();
    const found: unknown[] = [];

    store
      .getState()
      .findText('3', 'utf-8', 'x'.repeat(maxFindLength + 1), (answer) =>
        found.push(answer),
      )();

    assert.deepStrictEqual(found, [{ matches: [], done: true }]);
    assert.deepStrictEqual(posted, []);
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

  test('forgets what the viewer showed once a tab is shown or hidden, so a viewer shown again asks for nothing before the main process views its file anew, which drops what is asked meanwhile', () => {
    const store = createCommanderStore(noop);
    const { receive } = store.getState();
    const viewing = () =>
      receive({ type: 'viewing', tab: '1', size: 10, version: '1' });

    receive({ type: 'show', tab: '1', file: '/work/a.txt' });
    viewing();
    receive({ type: 'show', tab: '2' });
    assert.strictEqual(store.getState().viewed, undefined);
    receive({ type: 'show', tab: '1', file: '/work/a.txt' });
    viewing();
    receive({ type: 'hide' });
    assert.strictEqual(store.getState().viewed, undefined);
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
});

import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, suite, test, vi } from 'vitest';
import { CellSelecting } from '../../../../../components/cells/page/cellSelecting';
import type { ScreenRow } from '../../../../../components/cells/page/lines';
import { noop } from '../../../../helpers/fixtures';
import { metrics, rowOf, shown } from './cellFixtures';

const texts = [
  'first word',
  'second word',
  'third',
  'fourth word',
  'fifth',
  'sixth word',
];

function rowsOf(): ScreenRow[] {
  let start = 0;
  return texts.map((text) => {
    const row = rowOf(text, start);
    start = row.end;
    return row;
  });
}

const all = rowsOf();

const at = (row: number, char: number) => ({ start: all[row]?.start, char });

const pointer = (row: number, char: number, more: MouseEventInit = {}) => ({
  clientX: char * metrics.advance,
  clientY: (row + 0.5) * metrics.rowHeight,
  bubbles: true,
  detail: 1,
  ...more,
});

function selectingIn(partial: boolean) {
  const { window } = new JSDOM('<!doctype html><main></main>');
  const { document } = window;
  const host = document.createElement('div');
  const canvas = document.createElement('canvas');
  host.append(canvas);
  document.body.append(host);
  let held: readonly ScreenRow[] = all.slice(0, 3);
  const chosen: (string | undefined)[] = [];
  const kept: unknown[] = [];
  const selecting = new CellSelecting(host, canvas, {
    shown: () => shown(held),
    held: () => held,
    partial: () => partial,
    cell: () => metrics,
    area: () => undefined,
    pressedAs: (press) => (press.shiftKey ? 'extend' : 'start'),
    changed: noop,
    began: noop,
    chosen: (copy) => chosen.push(copy),
    kept: (selection) => kept.push(selection),
    move: noop,
  });
  return {
    selecting,
    chosen,
    kept,
    press: (row: number, char: number, more: MouseEventInit = {}) =>
      host.dispatchEvent(
        new window.MouseEvent('mousedown', pointer(row, char, more)),
      ),
    drag: (row: number, char: number) =>
      document.dispatchEvent(
        new window.MouseEvent('mousemove', pointer(row, char)),
      ),
    release: () => document.dispatchEvent(new window.MouseEvent('mouseup')),
    hold: (rows: readonly ScreenRow[]) => {
      held = rows;
      selecting.rowsChanged();
    },
    copied: () => {
      let copied: string | undefined;
      document.dispatchEvent(
        Object.assign(new window.Event('copy'), {
          clipboardData: {
            setData: (_: string, text: string) => {
              copied = text;
            },
          },
        }),
      );
      return copied;
    },
  };
}

suite('Text selected in cells', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('marks the copies of what is selected at once once the selection is done, by a double click or a drag let go, and none while a drag goes on, rather than a quarter of a second after the selection rested, mid drag too', () => {
    const clicked = selectingIn(true);
    clicked.press(1, 8, { detail: 2 });
    clicked.release();

    assert.deepStrictEqual(clicked.chosen, ['word']);

    const dragged = selectingIn(true);
    dragged.press(1, 7);
    dragged.drag(1, 9);
    vi.advanceTimersByTime(1000);

    assert.deepStrictEqual(dragged.chosen, []);

    dragged.drag(1, 11);
    dragged.release();

    assert.deepStrictEqual(dragged.chosen, ['word']);
  });

  test('keeps what is selected, and its copies marked, once a view that holds only a part of its text holds its line no longer, and copies it as it was selected, as a file viewed dropped the selection and marked its copies no longer once scrolled a few pages on', () => {
    const view = selectingIn(true);
    const word = { anchor: at(1, 7), focus: at(1, 11) };

    view.press(1, 8, { detail: 2 });
    view.release();
    vi.advanceTimersByTime(250);
    view.hold(all.slice(3));

    assert.deepStrictEqual(view.selecting.selection, word);
    assert.deepStrictEqual(view.chosen, ['word']);
    assert.strictEqual(view.copied(), 'word');

    view.hold(all.slice(0, 3));

    assert.deepStrictEqual(view.selecting.selection, word);
    assert.deepStrictEqual(view.chosen, ['word']);
    assert.strictEqual(view.copied(), 'word');
  });

  test('drops what is selected once no row is held, as the text is another one then, and in a view that holds its whole text once the selection reaches past the rows it holds', () => {
    const part = selectingIn(true);
    part.press(1, 8, { detail: 2 });
    part.release();
    vi.advanceTimersByTime(250);
    part.hold([]);

    assert.strictEqual(part.selecting.selection, undefined);
    assert.deepStrictEqual(part.chosen, ['word', undefined]);
    assert.strictEqual(part.copied(), undefined);

    const whole = selectingIn(false);
    whole.press(2, 1, { detail: 2 });
    whole.release();
    vi.advanceTimersByTime(250);
    whole.hold(all.slice(0, 2));

    assert.strictEqual(whole.selecting.selection, undefined);
    assert.deepStrictEqual(whole.chosen, ['third', undefined]);
  });

  test('keeps the text of a selection dragged on past the rows held when it began, as far as the view moves under the pointer, and leaves out what a drag back gives up, so it is copied whole, as a file viewed dropped a selection dragged over more than the few screens it holds', () => {
    const view = selectingIn(true);

    view.press(0, 6);
    view.drag(2, 5);
    assert.strictEqual(view.copied(), 'word\nsecond word\nthird');

    view.hold(all.slice(1, 4));
    assert.deepStrictEqual(view.selecting.selection, {
      anchor: at(0, 6),
      focus: at(3, 5),
    });
    assert.strictEqual(view.copied(), 'word\nsecond word\nthird\nfourt');

    view.hold(all.slice(3, 6));
    assert.strictEqual(
      view.copied(),
      'word\nsecond word\nthird\nfourth word\nfifth\nsixth',
    );

    view.drag(0, 6);
    view.release();
    assert.deepStrictEqual(view.selecting.selection, {
      anchor: at(0, 6),
      focus: at(3, 6),
    });
    assert.strictEqual(view.copied(), 'word\nsecond word\nthird\nfourth');
  });

  test('starts a selection anew where a press with Shift lands once the text between it and where the selection ended is held no longer, as what it would reach over is not known', () => {
    const view = selectingIn(true);
    view.press(0, 6);
    view.drag(1, 6);
    view.release();
    view.hold(all.slice(4));

    view.press(1, 2, { shiftKey: true });
    view.release();

    assert.deepStrictEqual(view.selecting.selection, {
      anchor: at(5, 2),
      focus: at(5, 2),
    });
    assert.strictEqual(view.copied(), undefined);
  });

  test('tells the selection to keep once a press or a drag is done, its text with it, and nothing while it is dragged, and that there is none once it is gone, so a view shown again can bring it back', () => {
    const view = selectingIn(true);

    view.press(0, 6);
    view.drag(1, 6);
    assert.deepStrictEqual(view.kept, []);
    view.release();
    view.press(1, 8, { detail: 2 });
    view.release();
    view.hold([]);

    assert.deepStrictEqual(view.kept, [
      {
        selection: { anchor: at(0, 6), focus: at(1, 6) },
        text: 'word\nsecond',
      },
      { selection: { anchor: at(1, 7), focus: at(1, 11) }, text: 'word' },
      undefined,
    ]);
  });

  test('brings back a selection kept, its copies marked at once rather than after it rests, its text copied though its rows are held no longer, and none for a selection that is not there', () => {
    const view = selectingIn(true);
    view.hold(all.slice(4));

    view.selecting.restore({
      selection: { anchor: at(1, 7), focus: at(1, 11) },
      text: 'word',
    });

    assert.deepStrictEqual(view.selecting.selection, {
      anchor: at(1, 7),
      focus: at(1, 11),
    });
    assert.deepStrictEqual(view.chosen, ['word']);
    assert.strictEqual(view.copied(), 'word');
    view.selecting.restore(undefined);
    assert.strictEqual(view.selecting.selection, undefined);
    assert.deepStrictEqual(view.chosen, ['word', undefined]);
  });
});

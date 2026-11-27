import * as assert from 'node:assert';
import { EditorSelection, EditorState } from '@codemirror/state';
import { afterEach, beforeEach, suite, test, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { plainCells } from '../../../../../lib/page/cellTable';
import { EditorSurface } from '../../../../../tools/editor/page/surface';
import { editorFind, setFind } from '../../../../../tools/editor/page/find';
import {
  nextOccurrence,
  occurrenceStepping,
} from '../../../../../tools/editor/page/nextOccurrence';
import {
  editorOccurrences,
  occurrencesIn,
  occurrencesShown,
  pointerHeld,
} from '../../../../../tools/editor/page/occurrences';
import { plainSearch } from '../../../../../lib/shared/searchOptions';

const text = 'total = sum(total);\nsubtotal Total total_x total';

const stateOf = (doc: string, selection: EditorSelection) =>
  EditorState.create({
    doc,
    selection,
    extensions: [
      EditorState.allowMultipleSelections.of(true),
      editorFind,
      occurrenceStepping,
      editorOccurrences,
    ],
  });

const marked = (
  state: EditorState,
  shown: readonly { from: number; to: number }[] = [
    { from: 0, to: state.doc.length },
  ],
) =>
  occurrencesIn(state, shown).map(({ from, to }) => [
    from,
    state.sliceDoc(from, to),
  ]);

const stepped = (state: EditorState) => {
  const spec = nextOccurrence(state);
  assert.ok(spec, 'no next occurrence');
  return state.update(spec).state;
};

suite('The occurrences the editor marks', () => {
  test('marks every whole word of the word the cursor is in or beside, in its case, the word itself too, and nothing while the cursor stands beside no word', () => {
    const every = [
      [0, 'total'],
      [12, 'total'],
      [43, 'total'],
    ];
    for (const at of [0, 2, 5, 12, 17, 43, 48]) {
      assert.deepStrictEqual(
        marked(stateOf(text, EditorSelection.single(at))),
        every,
        `the cursor at ${at}`,
      );
    }
    assert.deepStrictEqual(
      marked(stateOf(text, EditorSelection.single(7))),
      [],
    );
  });

  test('takes for a word what the W of a find takes, letters of every script however they are composed, digits and underscores', () => {
    const words = 'café café cafés 2_x 2_x';
    assert.deepStrictEqual(marked(stateOf(words, EditorSelection.single(1))), [
      [0, 'café'],
      [5, 'café'],
    ]);
    assert.deepStrictEqual(marked(stateOf(words, EditorSelection.single(17))), [
      [17, '2_x'],
      [21, '2_x'],
    ]);
  });

  test('marks every other copy of the text selected, in its case, inside longer words too, but not the selection itself', () => {
    assert.deepStrictEqual(
      marked(stateOf(text, EditorSelection.single(0, 3))),
      [
        [12, 'tot'],
        [23, 'tot'],
        [35, 'tot'],
        [43, 'tot'],
      ],
    );
  });

  test('leaves the blanks at the ends of the text selected out of what it seeks, as the views leave them out, so a word selected with the space after it marks the other copies of the word', () => {
    assert.deepStrictEqual(
      marked(stateOf(text, EditorSelection.single(0, 6))),
      [
        [12, 'total'],
        [23, 'total'],
        [35, 'total'],
        [43, 'total'],
      ],
    );
  });

  test('marks the other copies of whitespace selected alone, as of any text selected, so a space selected marks the other spaces', () => {
    assert.deepStrictEqual(
      marked(stateOf(text, EditorSelection.single(5, 6))),
      [
        [7, ' '],
        [28, ' '],
        [34, ' '],
        [42, ' '],
      ],
    );
  });

  test('marks nothing for a selection across a line break or of more than 200 characters, nor for several cursors, and the other copies of one text selected in several places', () => {
    for (const selection of [
      EditorSelection.single(17, 23),
      EditorSelection.create([
        EditorSelection.cursor(2),
        EditorSelection.cursor(12),
      ]),
      EditorSelection.create([
        EditorSelection.range(0, 5),
        EditorSelection.cursor(12),
      ]),
      EditorSelection.create([
        EditorSelection.range(0, 3),
        EditorSelection.range(12, 17),
      ]),
    ]) {
      assert.deepStrictEqual(
        marked(stateOf(text, selection)),
        [],
        JSON.stringify(selection),
      );
    }
    const long = `${'y'.repeat(201)} ${'y'.repeat(201)}`;
    assert.deepStrictEqual(
      marked(stateOf(long, EditorSelection.single(0, 201))),
      [],
    );
    assert.deepStrictEqual(
      marked(stateOf(long, EditorSelection.single(0, 200))),
      [[202, 'y'.repeat(200)]],
    );
    assert.deepStrictEqual(
      marked(
        stateOf(
          text,
          EditorSelection.create([
            EditorSelection.range(0, 5),
            EditorSelection.range(12, 17),
          ]),
        ),
      ),
      [
        [23, 'total'],
        [35, 'total'],
        [43, 'total'],
      ],
    );
  });

  test('marks only the whole words Ctrl+D steps to once it selected the word at the cursor, leaving out those it selected', () => {
    const once = stepped(stateOf(text, EditorSelection.single(13)));
    assert.deepStrictEqual(marked(once), [
      [0, 'total'],
      [43, 'total'],
    ]);
    assert.deepStrictEqual(marked(stepped(once)), [[0, 'total']]);
  });

  test('marks nothing while the find has a text, as its own marks show then, and marks again once its text is empty or it closes', () => {
    const state = stateOf(text, EditorSelection.single(2));
    const finding = state.update({
      effects: setFind.of({ text: 'sum', options: plainSearch }),
    }).state;
    assert.deepStrictEqual(marked(finding), []);
    for (const query of [{ text: '', options: plainSearch }, undefined]) {
      assert.strictEqual(
        marked(finding.update({ effects: setFind.of(query) }).state).length,
        3,
      );
    }
  });

  test('marks nothing once the text changes, so a word half typed is not marked as it grows, until the cursor moves again', () => {
    const state = stateOf(text, EditorSelection.single(2));
    const typed = state.update({
      changes: { from: 5, insert: 's' },
      selection: EditorSelection.cursor(6),
    }).state;
    assert.deepStrictEqual(marked(typed), []);
    const changed = state.update({
      changes: { from: text.length, insert: ' total' },
    }).state;
    assert.deepStrictEqual(marked(changed), []);
    assert.deepStrictEqual(
      marked(changed.update({ effects: setFind.of(undefined) }).state),
      [],
    );
    assert.deepStrictEqual(
      marked(changed.update({ selection: EditorSelection.cursor(2) }).state),
      [
        [0, 'total'],
        [12, 'total'],
        [43, 'total'],
        [49, 'total'],
      ],
    );
  });

  test('marks only the copies in the ranges shown, one across their edge too, telling a whole word by the text beyond the edge', () => {
    const state = stateOf(text, EditorSelection.single(2));
    assert.deepStrictEqual(marked(state, [{ from: 13, to: 15 }]), [
      [12, 'total'],
    ]);
    assert.deepStrictEqual(marked(state, [{ from: 24, to: 30 }]), []);
    assert.deepStrictEqual(
      marked(state, [
        { from: 0, to: 3 },
        { from: 44, to: 48 },
      ]),
      [
        [0, 'total'],
        [43, 'total'],
      ],
    );
  });
});

suite('When the editor marks the occurrences', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    Reflect.set(globalThis, 'devicePixelRatio', 1);
  });

  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(globalThis, 'devicePixelRatio');
  });

  test('marks none while the pointer is held, as a drag grows the selection, and the copies at once once it is let go, and those of a selection moved by a key a tenth of a second after, rather than a quarter of a second after any selection rested', () => {
    const { window } = new JSDOM('<!doctype html><main></main>');
    const main = window.document.querySelector('main');
    assert.ok(main);
    const view = new EditorSurface(
      main,
      stateOf('total = sum(total) subtotal total', EditorSelection.single(0)),
      plainCells,
    );
    const shown = () => occurrencesShown(view).map(({ from }) => from);
    view.dispatch({ effects: pointerHeld.of(true) });
    view.dispatch({
      selection: EditorSelection.single(0, 5),
      userEvent: 'select.pointer',
    });
    vi.advanceTimersByTime(1000);
    const held = shown();
    view.dispatch({ effects: pointerHeld.of(false) });
    const released = shown();
    view.dispatch({
      selection: EditorSelection.single(12, 17),
      userEvent: 'select',
    });
    const keyed = shown();
    vi.advanceTimersByTime(100);
    const rested = shown();
    view.destroy();

    assert.deepStrictEqual(
      { held, released, keyed, rested },
      {
        held: [],
        released: [12, 22, 28],
        keyed: [],
        rested: [0, 22, 28],
      },
    );
  });
});

import * as assert from 'node:assert';
import { EditorSelection, EditorState } from '@codemirror/state';
import { suite, test } from 'vitest';
import {
  nextOccurrence,
  occurrenceStepping,
} from '../../../../../tools/editor/page/nextOccurrence';

const text = 'total = sum(total);\nsubtotal Total total_x total';

const stateOf = (selection: EditorSelection) =>
  EditorState.create({
    doc: text,
    selection,
    extensions: [
      EditorState.allowMultipleSelections.of(true),
      occurrenceStepping,
    ],
  });

const step = (state: EditorState) => {
  const spec = nextOccurrence(state);
  return spec === undefined ? undefined : state.update(spec).state;
};

const selected = (state: EditorState | undefined) =>
  state?.selection.ranges.map(({ from, to }) => [from, to]);

suite('Selecting the next occurrence', () => {
  test('selects the word at the cursor first, as the W of a find takes a word, then each next copy of it that is a whole word in its case, going round to the start, and nothing once every one is selected', () => {
    let state = stateOf(EditorSelection.single(13));
    const seen = [];
    for (let at = 0; at < 3; at++) {
      const next = step(state);
      assert.ok(next, `no step ${at + 1}`);
      state = next;
      seen.push(selected(state));
    }
    assert.deepStrictEqual(seen, [
      [[12, 17]],
      [
        [12, 17],
        [43, 48],
      ],
      [
        [0, 5],
        [12, 17],
        [43, 48],
      ],
    ]);
    assert.strictEqual(step(state), undefined);
  });

  test('steps to every next copy of a text selected otherwise, inside longer words too, as the marks of the selection show them', () => {
    let state: EditorState | undefined = stateOf(EditorSelection.single(0, 5));
    for (let at = 0; at < 4; at++) {
      state = step(state ?? assert.fail('no step'));
    }
    assert.deepStrictEqual(selected(state), [
      [0, 5],
      [12, 17],
      [23, 28],
      [35, 40],
      [43, 48],
    ]);
  });

  test('steps by the text again once the selection is changed otherwise than by Ctrl+D', () => {
    const word = step(stateOf(EditorSelection.single(13)));
    assert.ok(word);
    const chosen = word.update({ selection: EditorSelection.single(12, 17) });
    assert.deepStrictEqual(selected(step(chosen.state)), [
      [12, 17],
      [23, 28],
    ]);
  });

  test('selects nothing while the cursor stands beside no word', () => {
    assert.strictEqual(
      nextOccurrence(stateOf(EditorSelection.single(7))),
      undefined,
    );
  });
});

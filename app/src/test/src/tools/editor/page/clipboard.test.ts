import * as assert from 'node:assert';
import { EditorSelection, EditorState } from '@codemirror/state';
import { suite, test } from 'vitest';
import {
  copied,
  cut,
  pasted,
} from '../../../../../tools/editor/page/clipboard';

type Span = readonly [anchor: number, head: number];

const stateOf = (doc: string, spans: readonly Span[], readOnly = false) =>
  EditorState.create({
    doc,
    selection: EditorSelection.create(
      spans.map(([anchor, head]) => EditorSelection.range(anchor, head)),
    ),
    extensions: [
      EditorState.allowMultipleSelections.of(true),
      EditorState.readOnly.of(readOnly),
    ],
  });

const text = 'one\ntwo\nthree';

suite('The clipboard of the text edited', () => {
  test('copies what every cursor selects, a line each, and the whole line of each cursor that selects nothing, once for two cursors on one line', () => {
    assert.deepStrictEqual(
      copied(
        stateOf(text, [
          [0, 2],
          [4, 4],
          [9, 12],
        ]),
      ),
      {
        text: 'on\nhre',
        ranges: [
          { from: 0, to: 2 },
          { from: 9, to: 12 },
        ],
        linewise: false,
      },
    );
    const lines = copied(
      stateOf(text, [
        [1, 1],
        [2, 2],
        [10, 10],
      ]),
    );
    assert.deepStrictEqual(
      [lines.text, lines.linewise, lines.ranges],
      [
        'one\nthree',
        true,
        [
          { from: 0, to: 4 },
          { from: 8, to: 13 },
        ],
      ],
    );
  });

  test('cuts what was copied out of the text, whole lines for cursors that select nothing, and nothing out of a text that is read-only', () => {
    const state = stateOf(text, [[5, 5]]);

    assert.strictEqual(
      cut(state, copied(state))?.state.doc.toString(),
      'one\nthree',
    );
    const selecting = stateOf(text, [[0, 2]]);
    assert.strictEqual(
      cut(selecting, copied(selecting))?.state.doc.toString(),
      'e\ntwo\nthree',
    );
    const locked = stateOf(text, [[0, 2]], true);
    assert.strictEqual(cut(locked, copied(locked)), undefined);
  });

  test('pastes a text in place of what every cursor selects, a line of it at each cursor when it has as many lines as there are cursors, and lines copied whole above the line of each cursor, with CRLF taken for a line break', () => {
    const pastedIn = (
      spans: readonly Span[],
      input: string,
      lines?: string,
    ) => {
      const change = pasted(stateOf(text, spans), input, lines);
      return [
        change?.state.doc.toString(),
        change?.state.selection.ranges.map(({ head }) => head),
      ];
    };

    assert.deepStrictEqual(
      pastedIn(
        [
          [0, 3],
          [4, 4],
        ],
        'x',
      ),
      ['x\nxtwo\nthree', [1, 3]],
    );
    assert.deepStrictEqual(
      pastedIn(
        [
          [0, 3],
          [4, 4],
        ],
        'a\r\nb',
      ),
      ['a\nbtwo\nthree', [1, 3]],
    );
    assert.deepStrictEqual(pastedIn([[5, 5]], 'zero', 'zero'), [
      'one\nzero\ntwo\nthree',
      [10],
    ]);
    assert.deepStrictEqual(pastedIn([[5, 5]], 'zero', 'other'), [
      'one\ntzerowo\nthree',
      [9],
    ]);
    assert.strictEqual(
      pasted(stateOf(text, [[0, 0]], true), 'x', undefined),
      undefined,
    );
  });
});

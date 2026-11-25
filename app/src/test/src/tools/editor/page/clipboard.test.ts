import * as assert from 'node:assert';
import { EditorSelection, EditorState } from '@codemirror/state';
import { suite, test } from 'vitest';
import {
  copied,
  cut,
  pasted,
} from '../../../../../tools/editor/page/clipboard';
import { endingsFrom } from '../../../../../tools/editor/page/endings';
import type { LineEnding } from '../../../../../tools/editor/shared/textMarks';

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

const endedState = (
  doc: string,
  spans: readonly Span[],
  ending: LineEnding,
  strays: readonly { readonly at: number; readonly ending: LineEnding }[] = [],
) => {
  const plain = stateOf(doc, spans);
  return EditorState.create({
    doc,
    selection: plain.selection,
    extensions: [
      EditorState.allowMultipleSelections.of(true),
      endingsFrom(plain.doc, { ending, strayEndings: strays }),
    ],
  });
};

const pastedText = (spans: readonly Span[], input: string, lines?: string) =>
  pasted(stateOf(text, spans), input, lines)?.state.doc.toString();

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
        'one\nthree\n',
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

  test('copies each line break with the ending the file has there, the ending of most of the file and a stray one as it is, as the viewer and the diff copy them, rather than a line feed for every one', () => {
    const state = endedState(text, [[0, 13]], 'crlf', [
      { at: 7, ending: 'cr' },
    ]);
    assert.strictEqual(copied(state).text, 'one\r\ntwo\rthree');
    const two = endedState(
      text,
      [
        [0, 2],
        [9, 12],
      ],
      'crlf',
    );
    assert.strictEqual(copied(two).text, 'on\r\nhre');
  });

  test('copies the whole line of a cursor that selects nothing with its line break, as other editors do, so an empty line copies a line break rather than emptying the clipboard, and a line pasted into another app comes as a line', () => {
    assert.strictEqual(
      copied(endedState(text, [[5, 5]], 'crlf', [{ at: 7, ending: 'cr' }]))
        .text,
      'two\r',
    );
    assert.strictEqual(
      copied(endedState(text, [[10, 10]], 'crlf')).text,
      'three\r\n',
    );
    assert.strictEqual(copied(stateOf('a\n\nb', [[2, 2]])).text, '\n');
  });

  test('pastes whole lines copied with their line breaks above the line of the cursor, a line of them at each cursor when there are as many, and every line once for cursors on one line', () => {
    assert.strictEqual(
      pastedText([[5, 5]], 'zero\r\n', 'zero\r\n'),
      'one\nzero\ntwo\nthree',
    );
    assert.strictEqual(
      pastedText(
        [
          [0, 0],
          [5, 5],
        ],
        'a\nb\n',
        'a\nb\n',
      ),
      'a\none\nb\ntwo\nthree',
    );
    assert.strictEqual(
      pastedText(
        [
          [0, 0],
          [1, 1],
        ],
        'p\nq\n',
        'p\nq\n',
      ),
      'p\nq\none\ntwo\nthree',
    );
  });

  test('pastes a text ending in a line break a line at each cursor when its lines but the last empty one are as many as the cursors, as lines copied from another app end in one', () => {
    assert.strictEqual(
      pasted(
        stateOf('x\ny', [
          [0, 0],
          [2, 2],
        ]),
        'a\nb\n',
        undefined,
      )?.state.doc.toString(),
      'ax\nby',
    );
    assert.strictEqual(
      pasted(stateOf('x', [[0, 0]]), 'a\n', undefined)?.state.doc.toString(),
      'a\nx',
    );
  });
});

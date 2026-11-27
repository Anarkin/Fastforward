import * as assert from 'node:assert';
import {
  EditorSelection,
  EditorState,
  type Extension,
  type Transaction,
} from '@codemirror/state';
import { suite, test } from 'vitest';
import {
  characterDeleted,
  groupDeleted,
  movedSideways,
  wordRangeAt,
} from '../../../../../components/editing/page/textSteps';

type Span = readonly [anchor: number, head: number];

const stateOf = (
  doc: string,
  spans: readonly Span[],
  more: Extension = [],
): EditorState =>
  EditorState.create({
    doc,
    selection: EditorSelection.create(
      spans.map(([anchor, head]) => EditorSelection.range(anchor, head)),
    ),
    extensions: [EditorState.allowMultipleSelections.of(true), more],
  });

const shown = (change: Transaction | undefined) =>
  change === undefined
    ? undefined
    : {
        text: change.state.doc.toString(),
        spans: change.state.selection.ranges.map(({ anchor, head }) => [
          anchor,
          head,
        ]),
      };

const spansOf = (selection: EditorSelection) =>
  selection.ranges.map(({ anchor, head }) => [anchor, head]);

const backward = (doc: string, spans: readonly Span[]) =>
  shown(characterDeleted(stateOf(doc, spans), false));

const forward = (doc: string, spans: readonly Span[]) =>
  shown(characterDeleted(stateOf(doc, spans), true));

const wordBackward = (doc: string, at: number) =>
  shown(groupDeleted(stateOf(doc, [[at, at]]), false))?.text;

const wordForward = (doc: string, at: number) =>
  shown(groupDeleted(stateOf(doc, [[at, at]]), true))?.text;

const moved = (
  doc: string,
  spans: readonly Span[],
  onward: boolean,
  selects = false,
) => spansOf(movedSideways(stateOf(doc, spans), 'character', onward, selects));

const movedByWord = (doc: string, at: number, onward: boolean) =>
  spansOf(
    movedSideways(stateOf(doc, [[at, at]]), 'group', onward, false),
  )[0]?.[0];

const range = (doc: string, at: number) => {
  const { from, to } = wordRangeAt(EditorState.create({ doc }), at);
  return [from, to];
};

suite('Steps through a text edited', () => {
  test('deletes the character before or after every cursor, a line break at an end of a line, what is selected in its place, an accent alone before a cursor and a whole character with its accents after one, and nothing of a text that is read-only or at either end', () => {
    assert.deepStrictEqual(
      backward('abc abc', [
        [3, 3],
        [7, 7],
      ]),
      {
        text: 'ab ab',
        spans: [
          [2, 2],
          [5, 5],
        ],
      },
    );
    assert.deepStrictEqual(backward('a\nb', [[2, 2]]), {
      text: 'ab',
      spans: [[1, 1]],
    });
    assert.deepStrictEqual(forward('a\nb', [[1, 1]]), {
      text: 'ab',
      spans: [[1, 1]],
    });
    assert.deepStrictEqual(backward('abcd', [[1, 3]]), {
      text: 'ad',
      spans: [[1, 1]],
    });
    assert.deepStrictEqual(backward('éx', [[2, 2]]), {
      text: 'ex',
      spans: [[1, 1]],
    });
    assert.deepStrictEqual(forward('éx', [[0, 0]]), {
      text: 'x',
      spans: [[0, 0]],
    });
    assert.strictEqual(backward('ab', [[0, 0]]), undefined);
    assert.strictEqual(forward('ab', [[2, 2]]), undefined);
    assert.strictEqual(
      characterDeleted(
        stateOf('ab', [[1, 1]], EditorState.readOnly.of(true)),
        false,
      ),
      undefined,
    );
  });

  test('deletes the word before or after every cursor with the blanks between them, and the line break at an end of a line', () => {
    assert.strictEqual(wordBackward('one two', 7), 'one ');
    assert.strictEqual(wordBackward('one two', 4), 'two');
    assert.strictEqual(wordForward('one two', 0), ' two');
    assert.strictEqual(wordForward('one two', 3), 'one');
    assert.strictEqual(wordBackward('one\ntwo', 4), 'onetwo');
    assert.strictEqual(wordForward('one\ntwo', 3), 'onetwo');
    assert.strictEqual(wordBackward('a.b(c)', 6), 'a.b(c');
  });

  test('moves every cursor a character left or right, over a line break at an end of a line and a character with its accents as one, to the edge of what it selected rather than past it, and reaches as far with Shift from where the selection began', () => {
    assert.deepStrictEqual(
      moved(
        'ab\ncd',
        [
          [0, 0],
          [2, 2],
        ],
        true,
      ),
      [
        [1, 1],
        [3, 3],
      ],
    );
    assert.deepStrictEqual(moved('ab\ncd', [[3, 3]], false), [[2, 2]]);
    assert.deepStrictEqual(moved('ab', [[0, 0]], false), [[0, 0]]);
    assert.deepStrictEqual(moved('ab', [[2, 2]], true), [[2, 2]]);
    assert.deepStrictEqual(moved('éx', [[0, 0]], true), [[2, 2]]);
    assert.deepStrictEqual(moved('abcd', [[1, 3]], true), [[3, 3]]);
    assert.deepStrictEqual(moved('abcd', [[3, 1]], false), [[1, 1]]);
    assert.deepStrictEqual(moved('abcd', [[1, 3]], true, true), [[1, 4]]);
    assert.deepStrictEqual(moved('abcd', [[1, 3]], false, true), [[1, 2]]);
  });

  test('moves every cursor a word left or right, past the blanks before it, a run of other characters a word of its own, and the line break at an end of a line as a blank', () => {
    assert.deepStrictEqual(
      [0, 3, 7].map((at) => movedByWord('one two', at, true)),
      [3, 7, 7],
    );
    assert.deepStrictEqual(
      [7, 4, 3, 0].map((at) => movedByWord('one two', at, false)),
      [4, 0, 0, 0],
    );
    assert.deepStrictEqual(
      [0, 3, 4].map((at) => movedByWord('one() two', at, true)),
      [3, 5, 5],
    );
    assert.strictEqual(movedByWord('one\ntwo', 3, true), 7);
    assert.strictEqual(movedByWord('one\ntwo', 4, false), 0);
  });

  test('takes the word a double click is on as the views take it, a letter with its accent within it, or else the whole character under it, an emoji whole, rather than by the words of CodeMirror, which ended a word at an accent', () => {
    const pig = String.fromCodePoint(0x1f437);
    assert.deepStrictEqual(range('cafe\u0301 au lait', 2), [0, 5]);
    assert.deepStrictEqual(range('one\nsecond word', 6), [4, 10]);
    assert.deepStrictEqual(range('(x)', 0), [0, 1]);
    assert.deepStrictEqual(range(`a ${pig} b`, 2), [2, 4]);
    assert.deepStrictEqual(range('', 0), [0, 0]);
  });
});

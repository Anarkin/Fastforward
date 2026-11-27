import * as assert from 'node:assert';
import { closeBrackets } from '@codemirror/autocomplete';
import {
  EditorSelection,
  EditorState,
  Text,
  type Extension,
  type Transaction,
} from '@codemirror/state';
import { suite, test } from 'vitest';
import {
  bracketsClose,
  typed,
} from '../../../../../components/editing/page/typed';

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

const insert = (from: number, to: number, text: string) => ({
  from,
  to,
  insert: Text.of(text.split('\n')),
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

const closing = [closeBrackets(), bracketsClose.of(true)];

const typedIn = (more: Extension, composing?: 'started') =>
  shown(
    typed(
      stateOf('', [[0, 0]], more),
      insert(0, 0, '('),
      EditorSelection.single(1),
      composing,
    ),
  );

suite('Typing in the text edited', () => {
  test('types what is typed at the main cursor at every cursor, in place of what each selects, and scrolls to it', () => {
    const state = stateOf('one two', [
      [0, 0],
      [4, 7],
    ]);
    const change = typed(
      state,
      insert(0, 0, 'x'),
      EditorSelection.single(1),
      undefined,
    );

    assert.deepStrictEqual(shown(change), {
      text: 'xone x',
      spans: [
        [1, 1],
        [6, 6],
      ],
    });
    assert.strictEqual(change.isUserEvent('input.type'), true);
    assert.strictEqual(change.scrollIntoView, true);
  });

  test('closes a bracket typed where brackets close as typed, and types it alone where they do not, or while an input method composes', () => {
    assert.deepStrictEqual(typedIn(closing), { text: '()', spans: [[1, 1]] });
    assert.deepStrictEqual(typedIn([]), { text: '(', spans: [[1, 1]] });
    assert.deepStrictEqual(typedIn(closing, 'started'), {
      text: '(',
      spans: [[1, 1]],
    });
  });

  test('takes a change away from the cursor, or what an input method composes, as it is told, at the main cursor alone, saying when a composition starts and goes on', () => {
    const state = stateOf('one two', [
      [7, 7],
      [3, 3],
    ]);
    const started = typed(
      state,
      insert(5, 7, 'wø'),
      EditorSelection.single(7),
      'started',
    );
    const going = typed(
      state,
      insert(5, 7, 'wö'),
      EditorSelection.single(7),
      'going',
    );

    assert.strictEqual(started.state.doc.toString(), 'one twø');
    assert.strictEqual(started.isUserEvent('input.type.compose.start'), true);
    assert.strictEqual(going.isUserEvent('input.type.compose.start'), false);
    assert.strictEqual(going.isUserEvent('input.type.compose'), true);
  });
});

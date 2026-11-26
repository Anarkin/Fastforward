import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { typedLayout } from '../../../../../tools/canvas/page/typedLayout';
import { typingKeyed } from '../../../../../tools/canvas/page/typingKeys';
import type { Caret } from '../../../../../tools/canvas/page/typing';
import type { Board } from '../../../../../tools/canvas/shared/board';
import { element } from '../../../../helpers/fixtures';
import { keyPress } from '../../../../helpers/keys';

const unit = { width: 7, height: 18 };

const text = 'ab cd ef';

const board: Board = {
  nodes: [
    {
      id: 'note',
      type: 'text',
      text,
      x: 0,
      y: 0,
      width: 9 * unit.width,
      height: 6 * unit.height,
    },
  ],
  edges: [],
};

const target = element('DIV', true);

const at = (head: number, anchor = head): Caret => ({ text, anchor, head });

const keyed = (
  key: string,
  caret: Caret,
  modifiers: { ctrlKey?: boolean; shiftKey?: boolean } = {},
) =>
  typingKeyed(
    keyPress(key, { target, ...modifiers }),
    caret,
    typedLayout(board, unit, () => 1, { id: 'note', ...caret }),
  );

const moved = (
  key: string,
  caret: Caret,
  modifiers: { ctrlKey?: boolean; shiftKey?: boolean } = {},
) => {
  const done = keyed(key, caret, modifiers);
  return done?.kind === 'caret'
    ? [done.caret.anchor, done.caret.head]
    : undefined;
};

suite('Canvas typing keys', () => {
  test('stops typing on Escape, and leaves the characters typed to the text context of the browser', () => {
    assert.deepStrictEqual(keyed('Escape', at(0)), { kind: 'stop' });
    assert.strictEqual(keyed('x', at(0)), undefined);
    assert.strictEqual(keyed(' ', at(0)), undefined);
  });

  test('starts a new line on Enter and deletes a character or a word on Backspace and Delete', () => {
    assert.deepStrictEqual(keyed('Enter', at(2)), {
      kind: 'caret',
      caret: { text: 'ab\n cd ef', anchor: 3, head: 3 },
    });
    assert.deepStrictEqual(keyed('Backspace', at(2)), {
      kind: 'caret',
      caret: { text: 'a cd ef', anchor: 1, head: 1 },
    });
    assert.deepStrictEqual(keyed('Delete', at(8, 5), {}), {
      kind: 'caret',
      caret: { text: 'ab cd', anchor: 5, head: 5 },
    });
    assert.deepStrictEqual(keyed('Backspace', at(5), { ctrlKey: true }), {
      kind: 'caret',
      caret: { text: 'ab  ef', anchor: 3, head: 3 },
    });
  });

  test('moves the caret across, up and down the rows the node wraps its text onto, to the ends of a row or the text, selecting with Shift, and selects the whole text on Mod+A', () => {
    assert.deepStrictEqual(moved('ArrowRight', at(0)), [1, 1]);
    assert.deepStrictEqual(
      moved('ArrowRight', at(0), { shiftKey: true }),
      [0, 1],
    );
    assert.deepStrictEqual(
      moved('ArrowRight', at(0), { ctrlKey: true }),
      [2, 2],
    );
    assert.deepStrictEqual(moved('ArrowDown', at(1)), [7, 7]);
    assert.deepStrictEqual(moved('ArrowUp', at(7), { shiftKey: true }), [7, 1]);
    assert.deepStrictEqual(moved('End', at(1)), [5, 5]);
    assert.deepStrictEqual(moved('Home', at(7)), [6, 6]);
    assert.deepStrictEqual(moved('End', at(1), { ctrlKey: true }), [8, 8]);
    assert.deepStrictEqual(moved('a', at(3), { ctrlKey: true }), [0, 8]);
  });
});

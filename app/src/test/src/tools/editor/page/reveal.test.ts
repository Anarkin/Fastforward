import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { movedInto } from '../../../../../tools/editor/page/reveal';

const shown = { from: 100, to: 400 };
const cell = (from: number) => ({ from, to: from + 18 });

suite('How far a view scrolls to bring a cell of the grid into sight', () => {
  test('stays where it is while the cell is in sight, at either edge too, and a hair past one, as the edges of a cell are summed from fractions of a pixel', () => {
    assert.deepStrictEqual(
      [cell(100), cell(250), cell(382), cell(99.999), cell(382.001)].map(
        (wanted) => movedInto(shown, wanted, 'nearest', 5, 1),
      ),
      [0, 0, 0, 0, 0],
    );
  });

  test('scrolls back to a cell before what is shown, the margin before it, and on to one after, the margin after it, never further than the nearer edge', () => {
    assert.deepStrictEqual(
      [
        movedInto(shown, cell(60), 'nearest', 5, 1),
        movedInto(shown, cell(410), 'nearest', 5, 1),
        movedInto(shown, cell(95), 'nearest', 0, 1),
        movedInto(shown, cell(390), 'nearest', 0, -1),
      ],
      [60 - 105, 428 - 400 + 5, -5, 8],
    );
  });

  test('shows the end of a selection taller than the view its head is at the end of, and its start when the head is at its start', () => {
    const tall = { from: 50, to: 500 };
    assert.deepStrictEqual(
      [
        movedInto(shown, tall, 'nearest', 5, 1),
        movedInto(shown, tall, 'nearest', 5, -1),
        movedInto(shown, { from: 150, to: 600 }, 'nearest', 5, -1),
      ],
      [500 - 400 + 5, 50 - 105, 150 - 105],
    );
  });

  test('puts the cell at the start, at the end or in the middle of the view when asked to, wherever it was', () => {
    assert.deepStrictEqual(
      [
        movedInto(shown, cell(500), 'start', 5, 1),
        movedInto(shown, cell(500), 'end', 5, 1),
        movedInto(shown, cell(500), 'center', 5, 1),
        movedInto(shown, cell(250), 'start', 0, 1),
      ],
      [500 - 5 - 100, 518 - 300 + 5 - 100, 509 - 150 - 100, 150],
    );
  });

  test('shows the side the head is on of a selection too tall to center', () => {
    const tall = { from: 500, to: 1000 };
    assert.deepStrictEqual(
      [
        movedInto(shown, tall, 'center', 5, -1),
        movedInto(shown, tall, 'center', 5, 1),
      ],
      [500 - 5 - 100, 1000 - 300 + 5 - 100],
    );
  });
});

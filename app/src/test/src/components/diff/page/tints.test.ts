import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { bandTint, rowTints } from '../../../../../components/diff/page/tints';

suite('Tints of a line of a diff', () => {
  test('tints a line removed or added across its row, a line changed as a whole in the tint of a changed word over that, and a line of context not at all', () => {
    assert.deepStrictEqual(
      [
        bandTint('removed', undefined),
        bandTint('added', [{ start: 1, end: 2 }]),
        bandTint('added', 'whole'),
        bandTint(undefined, undefined),
      ],
      ['removed', 'added', 'added+added-word', undefined],
    );
  });

  test('tints the changed words of a line over the tint of its row and bars the places the other line has words it lacks, which have no width', () => {
    assert.deepStrictEqual(
      rowTints('removed', [
        { start: 2, end: 5 },
        { start: 7, end: 7 },
        { start: 9, end: 12 },
      ]),
      {
        row: 'removed',
        word: 'removed-word',
        words: [
          { from: 2, to: 5 },
          { from: 9, to: 12 },
        ],
        gaps: [7],
      },
    );
  });

  test('gives a line without changed words the tint of its row alone, the same for every line of context so their rows are worked out once', () => {
    assert.deepStrictEqual(rowTints('added', []), { row: 'added' });
    assert.deepStrictEqual(rowTints('added', 'whole'), {
      row: 'added+added-word',
    });
    assert.strictEqual(rowTints(undefined, undefined), rowTints(undefined, []));
  });
});

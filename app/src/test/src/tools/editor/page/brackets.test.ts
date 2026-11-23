import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { matchedPair } from '../../../../../tools/editor/page/brackets';

const marked = (match: Parameters<typeof matchedPair>[0]) => matchedPair(match);

suite('The brackets the editor marks', () => {
  test('marks both brackets of a pair that match, the one beside the cursor and the other', () => {
    assert.deepStrictEqual(
      marked({
        start: { from: 9, to: 10 },
        end: { from: 4, to: 5 },
        matched: true,
      }),
      [
        { from: 9, to: 10 },
        { from: 4, to: 5 },
      ],
    );
  });

  test('marks nothing beside a bracket that matches none, nor beside two that do not match each other', () => {
    assert.deepStrictEqual(
      marked({ start: { from: 4, to: 5 }, matched: false }),
      [],
    );
    assert.deepStrictEqual(
      marked({
        start: { from: 4, to: 5 },
        end: { from: 7, to: 8 },
        matched: false,
      }),
      [],
    );
  });
});

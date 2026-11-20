import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { matchedPair } from '../../../../../tools/editor/page/brackets';

const marked = (match: Parameters<typeof matchedPair>[0]) =>
  matchedPair(match).map((range) => ({
    from: range.from,
    to: range.to,
    class: String(range.value.spec.class),
  }));

suite('The brackets the editor marks', () => {
  test('marks both brackets of a pair that match, the one beside the cursor and the other, in the class the yellow of a find match is drawn for', () => {
    assert.deepStrictEqual(
      marked({
        start: { from: 9, to: 10 },
        end: { from: 4, to: 5 },
        matched: true,
      }),
      [
        { from: 9, to: 10, class: 'cm-matchingBracket' },
        { from: 4, to: 5, class: 'cm-matchingBracket' },
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

import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { packedPart, partLine, partLines } from '../../ui/syntaxParts';

suite('Colors of code sent in parts', () => {
  test('packs the ranges of the lines of a part into four bytes each, and reads each line back by its index in the code', () => {
    const lines = [
      [
        { start: 0, end: 5, kind: 'keyword' as const },
        { start: 10, end: 13, kind: 'string' as const },
      ],
      [],
      [{ start: 2, end: 4095, kind: 'comment' as const }],
    ];

    const part = packedPart(lines, 7, true);

    assert.strictEqual(part.ranges.byteLength, 3 * 4);
    assert.deepStrictEqual(
      [partLine(part, 7), partLine(part, 8), partLine(part, 9)],
      lines,
    );
    assert.strictEqual(partLine(part, 6), undefined);
    assert.strictEqual(partLine(part, 10), undefined);
    assert.deepStrictEqual(partLines(part), lines);
    assert.strictEqual(part.done, true);
  });

  test('leaves out a range ending past the widest column a part holds, as no line that long is colored', () => {
    const part = packedPart(
      [
        [
          { start: 0, end: 3, kind: 'keyword' },
          { start: 4000, end: 4096, kind: 'string' },
        ],
      ],
      0,
      false,
    );

    assert.deepStrictEqual(partLines(part), [
      [{ start: 0, end: 3, kind: 'keyword' }],
    ]);
  });
});

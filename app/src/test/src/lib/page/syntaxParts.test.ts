import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  packedPart,
  partLine,
  partLines,
} from '../../../../lib/page/syntaxParts';

suite('Colors of code sent in parts', () => {
  test('packs the ranges of the lines of a part into four bytes each, and reads each line back by its index in the code, as an object per range took 25 times the memory, about 190 MB for 10 MB of code', () => {
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

  test('holds ranges as far as the 20000th column, the longest line colored, cutting one too long for its four bytes into ranges side by side', () => {
    const part = packedPart(
      [
        [
          { start: 0, end: 3, kind: 'keyword' },
          { start: 3, end: 20_000, kind: 'string' },
        ],
      ],
      0,
      false,
    );

    assert.deepStrictEqual(partLines(part), [
      [
        { start: 0, end: 3, kind: 'keyword' },
        { start: 3, end: 16_386, kind: 'string' },
        { start: 16_386, end: 20_000, kind: 'string' },
      ],
    ]);
  });

  test('leaves out a range starting past the widest column a part holds, as no line that long is colored', () => {
    const part = packedPart(
      [
        [
          { start: 0, end: 3, kind: 'keyword' },
          { start: 32_768, end: 32_770, kind: 'string' },
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

import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { lineParts } from '../../ui/editorText';
import type { TextWidths } from '../../ui/textWidths';

const boxing: TextWidths = {
  char: 10,
  of: () => 20,
  boxed: (cluster) => (/[😀中]/u.test(cluster) ? 2 : undefined),
  scaled: (cluster) => (cluster === '😀' ? 0.875 : undefined),
};

suite('Parts of a line of the editor', () => {
  test('puts the characters drawn wider or narrower than their columns in boxes, with the size a glyph wider than its box is shrunk to, as the diff does, leaving an unwrapped line otherwise as it is', () => {
    assert.deepStrictEqual(lineParts('ab😀c中 x.y(z)', undefined, boxing), [
      { kind: 'cell', from: 2, to: 4, cells: 2, scale: 0.875 },
      { kind: 'cell', from: 5, to: 6, cells: 2, scale: undefined },
    ]);
    assert.deepStrictEqual(lineParts('x.y(z)', undefined, boxing), []);
    assert.deepStrictEqual(lineParts('😀', undefined, undefined), []);
  });

  test('keeps the indentation of a wrapped line together, hanging its rows that far in, and marks after it the places the diff breaks a line at, after punctuation and before brackets, as VS Code does', () => {
    assert.deepStrictEqual(lineParts('    foo(bar).baz;', 4, boxing), [
      { kind: 'lead', from: 0, to: 4 },
      { kind: 'break', from: 7, to: 7 },
      { kind: 'break', from: 13, to: 13 },
    ]);
  });

  test('marks the places to break a wrapped line whose indentation does not hang, leaving its indentation free to break as the diff does', () => {
    assert.deepStrictEqual(lineParts('\t  a.b', 0, boxing), [
      { kind: 'break', from: 5, to: 5 },
    ]);
  });

  test('works out only the part of a long line in view, looking a few characters past it, and gives that part as the whole line would, breaks only on a line of up to 64 KiB as the diff', () => {
    for (const [repeats, at, broken] of [
      [20_000, 120_000, false],
      [4_000, 24_000, true],
    ] as const) {
      const text = `  ${'a.中😀 b(c), '.repeat(repeats)}`;
      let asked = 0;
      const counting: TextWidths = {
        ...boxing,
        boxed: (cluster) => {
          asked += 1;
          return boxing.boxed?.(cluster);
        },
      };
      const window = { from: at, to: at + 400 };
      const parts = lineParts(text, 2, counting, window);
      assert.ok(asked < 400, `${asked} characters measured`);
      assert.deepStrictEqual(
        parts,
        lineParts(text, 2, boxing).filter(
          (part) =>
            part.kind === 'lead' ||
            (part.from >= window.from && part.to <= window.to),
        ),
      );
      assert.ok(parts.some((part) => part.kind === 'cell'));
      assert.strictEqual(
        parts.some((part) => part.kind === 'break'),
        broken,
      );
    }
  });

  test('marks the breaks and boxes of a wrapped line in order, a box between two breaks too', () => {
    assert.deepStrictEqual(lineParts('  a.中.b', 2, boxing), [
      { kind: 'lead', from: 0, to: 2 },
      { kind: 'break', from: 4, to: 4 },
      { kind: 'cell', from: 4, to: 5, cells: 2, scale: undefined },
      { kind: 'break', from: 6, to: 6 },
    ]);
  });
});

import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { keepColors, keptColorsOf } from '../../../../lib/page/keptColors';
import { packedPart } from '../../../../lib/page/syntaxParts';
import { comment, keptPatch } from '../../tools/git/page/syntaxFixtures';

suite('Syntax', () => {
  test('colors the shown lines of a side by the colors kept of the whole text of its blob, found by their numbers, keeping the longer of two in the language colored, and forgetting the least recently used beyond 200000 lines', () => {
    const files = keptPatch('3', '4');
    const lines = [comment(8), comment(6), comment(8), comment(6)];
    keepColors('typescript', '4'.repeat(40), packedPart(lines, 0, true), 10);
    keepColors(
      'typescript',
      '4'.repeat(40),
      packedPart(lines.slice(0, 2), 0, true),
      10,
    );
    assert.deepStrictEqual(Object.fromEntries(keptColorsOf(files)), {
      '0:1': lines[2],
      '0:2': lines[3],
    });
    assert.deepStrictEqual(keptColorsOf(files, undefined, 'json').size, 0);
    keepColors(
      'typescript',
      '5'.repeat(40),
      packedPart(
        Array.from({ length: 199_996 }, () => []),
        0,
        true,
      ),
      10,
    );
    assert.deepStrictEqual(keptColorsOf(keptPatch('9', '5')).size, 2);
    assert.deepStrictEqual(keptColorsOf(files).size, 2);
    keepColors('typescript', '6'.repeat(40), packedPart([[]], 0, true), 10);
    assert.deepStrictEqual(keptColorsOf(keptPatch('9', '5')).size, 0);
    assert.deepStrictEqual(keptColorsOf(files).size, 2);
  });

  test('forgets the colors kept of a language from before a language it embeds loaded once colors of it come from after, keeping those of the other languages', () => {
    const part = packedPart([[], [], comment(8), comment(6)], 0, true);
    keepColors('typescript', 'a'.repeat(40), part, 20);
    keepColors('json', 'c'.repeat(40), part, 99);
    assert.deepStrictEqual(keptColorsOf(keptPatch('9', 'a')).size, 2);
    keepColors('typescript', 'b'.repeat(40), part, 21);
    assert.deepStrictEqual(keptColorsOf(keptPatch('9', 'a')).size, 0);
    assert.deepStrictEqual(keptColorsOf(keptPatch('9', 'b')).size, 2);
  });
});

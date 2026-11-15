import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import type { LineWords } from '../../../../../tools/git/page/wordDiff';
import {
  codeProps,
  wholeChangeClass,
} from '../../../../../tools/git/page/lineMarks';

suite('Drawing code', () => {
  test('gives a line the same inputs to draw it from while its colors, changed words and matches stay, so it is not drawn again', () => {
    const keyword = [{ start: 0, end: 3, kind: 'keyword' as const }];
    const changed = [{ start: 4, end: 7 }];
    const match = { file: 0, line: 1, start: 4, end: 5 };
    const matched = [match];
    const marks = () => ({
      syntax: new Map([['0:1', keyword]]),
      words: new Map([['0:1', changed]]),
      finds: new Map([['0:1', matched]]),
      foundKey: '0:1',
      found: match,
      whitespace: false,
    });
    const before = codeProps(marks(), '0:1', 'let sum', 'removed');
    const after = codeProps(marks(), '0:1', 'let sum', 'removed');
    assert.deepStrictEqual(
      Object.entries(after).map(([name, value]) => [name, value]),
      Object.entries(before),
    );
    assert.ok(
      Object.values(after).every(
        (value, index) => Object.values(before)[index] === value,
      ),
    );
    assert.strictEqual(before.wordClass, 'word-removed');
    assert.strictEqual(before.current, match);
    const plain = codeProps(marks(), '0:2', 'x', 'added');
    const again = codeProps(marks(), undefined, 'x', undefined);
    assert.deepStrictEqual(plain.syntax, []);
    assert.strictEqual(again.syntax, plain.syntax);
    assert.strictEqual(again.words, plain.words);
    assert.strictEqual(again.finds, plain.finds);
    assert.strictEqual(plain.current, undefined);
    assert.strictEqual(plain.wordClass, 'word-added');
  });

  test('tints the row of a line changed through instead of marking its words', () => {
    const words = new Map<string, LineWords>([
      ['0:1', 'whole'],
      ['0:2', [{ start: 0, end: 1 }]],
    ]);
    const marks = {
      syntax: new Map(),
      words,
      finds: new Map(),
      foundKey: undefined,
      found: undefined,
      whitespace: false,
    };
    assert.deepStrictEqual(codeProps(marks, '0:1', 'x', 'added').words, []);
    assert.deepStrictEqual(codeProps(marks, '0:2', 'x', 'added').words, [
      { start: 0, end: 1 },
    ]);
    assert.strictEqual(wholeChangeClass(words, '0:1'), 'whole-change');
    assert.strictEqual(wholeChangeClass(words, '0:2'), '');
    assert.strictEqual(wholeChangeClass(words, undefined), '');
  });
});

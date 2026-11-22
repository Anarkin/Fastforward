import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { realOf, realWhere } from '../../../../lib/page/picturedCopy';

suite('Copying a text drawn with control pictures', () => {
  test('gives back the control characters their pictures were drawn for, and keeps the pictures the file itself holds, told by the text selected without them', () => {
    assert.strictEqual(realOf('a␛[0m b␇', 'a␛[0m b␇'), 'a\u001b[0m b\u0007');
    assert.strictEqual(realOf('a␛b␛c', 'ab␛c'), 'a␛b\u001bc');
    assert.strictEqual(realOf('␇␡ x ␁', ' x ␁'), '␇␡ x \u0001');
    assert.strictEqual(realOf('x␁␛', 'x␁'), 'x\u0001␛');
  });

  test('leaves a text without pictures as it is', () => {
    assert.strictEqual(realOf('plain\ttext', 'plain\ttext'), 'plain\ttext');
  });

  test('keeps a picture the file holds right beside the same control character, told by where the text selected is marked once the pictures kept are written over, as leaving them out could not say which of the two alike was kept', () => {
    assert.strictEqual(realWhere('a␛␛b', 'a﷐␛b'), 'a␛\u001bb');
    assert.strictEqual(realWhere('a␛␛b', 'a␛﷐b'), 'a\u001b␛b');
    assert.strictEqual(realWhere('␇ x', '␇ x'), '\u0007 x');
  });
});

import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { realOf, realWhere } from '../../../../lib/page/picturedCopy';

const formFeed = String.fromCharCode(12);

suite('Copying a text drawn with control pictures', () => {
  test('gives back the form feeds their pictures were drawn for, and keeps the pictures the file itself holds, told by the text selected without them', () => {
    assert.strictEqual(
      realOf('a␌[0m b␌', 'a␌[0m b␌'),
      `a${formFeed}[0m b${formFeed}`,
    );
    assert.strictEqual(realOf('a␌b␌c', 'ab␌c'), `a␌b${formFeed}c`);
    assert.strictEqual(realOf('␌␌ x ␌', ' x ␌'), `␌␌ x ${formFeed}`);
    assert.strictEqual(realOf('x␌␌', 'x␌'), `x${formFeed}␌`);
  });

  test('leaves a text without the picture of a form feed as it is, the control characters the font draws and the pictures of others a file holds too', () => {
    assert.strictEqual(realOf('plain	text', 'plain	text'), 'plain	text');
    assert.strictEqual(realOf('a\u001b␛␡b', 'a\u001b␛␡b'), 'a\u001b␛␡b');
  });

  test('keeps a picture the file holds right beside a form feed, told by where the text selected is marked once the pictures kept are written over, as leaving them out could not say which of the two alike was kept', () => {
    assert.strictEqual(realWhere('a␌␌b', 'a\ufdd0␌b'), `a␌${formFeed}b`);
    assert.strictEqual(realWhere('a␌␌b', 'a␌\ufdd0b'), `a${formFeed}␌b`);
    assert.strictEqual(realWhere('␌ x', '␌ x'), `${formFeed} x`);
  });
});

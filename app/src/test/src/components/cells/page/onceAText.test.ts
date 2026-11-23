import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { onceAText } from '../../../../../components/cells/page/onceAText';

suite('What is worked out of a text, kept', () => {
  test('works out what a text gives once for each way it is asked for, however often it is asked again, as the rows of a file come back at each step of a scrollbar dragged', () => {
    const found: string[] = [];
    const lengthOf = onceAText((text: string, doubled: boolean) => {
      found.push(`${text}:${doubled}`);
      return doubled ? text.length * 2 : text.length;
    });

    assert.strictEqual(lengthOf('abc', false), 3);
    assert.strictEqual(lengthOf('abc', false), 3);
    assert.strictEqual(lengthOf('abc', true), 6);
    assert.strictEqual(lengthOf('abc', true), 6);
    assert.strictEqual(lengthOf('de', false), 2);

    assert.deepStrictEqual(found, ['abc:false', 'abc:true', 'de:false']);
  });

  test('forgets the texts asked for longest ago once those kept hold more characters than it may keep, a text asked for again counting as new, so a file of any size scrolled through keeps no more than its last lines', () => {
    const found: string[] = [];
    const firstOf = onceAText((text: string, way: number) => {
      found.push(text);
      return text[way];
    }, 10);

    firstOf('aaaa', 0);
    firstOf('bbbb', 0);
    firstOf('aaaa', 0);
    firstOf('cccc', 0);
    firstOf('aaaa', 0);
    firstOf('bbbb', 0);

    assert.deepStrictEqual(found, ['aaaa', 'bbbb', 'cccc', 'bbbb']);
  });
});

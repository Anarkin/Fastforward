import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { invisibleParts } from '../../../../lib/page/invisibles';

suite('Invisible characters', () => {
  test('takes every control, format character, separator of lines and character Unicode lets render as nothing for invisible, by one rule of its properties, the C0 controls and the delete too, leaving out the spaces, which are signed as blanks, and the tab and the line ends, which whitespace shown signs', () => {
    for (const cluster of [
      '\u200B',
      '\u00AD',
      '\u0085',
      '\u2028',
      '\u2029',
      '\uFEFF',
      '\u2060',
      '\u{E0067}',
      '\uFE0F',
      '\u3164',
      '\u115F',
      '\u202E',
      '\u{1BCA0}',
      '\uFFFC',
      '\u001B',
      '\u007F',
      '\u000C',
      '\uFDD0',
      '\u{1FFFE}',
    ]) {
      assert.deepStrictEqual(
        invisibleParts(cluster),
        [{ text: cluster, hidden: true }],
        cluster.codePointAt(0)?.toString(16),
      );
    }
    for (const cluster of [
      'a',
      ' ',
      '\u00A0',
      '\u3000',
      '\u2800',
      '\t',
      '\r',
      '\n',
    ]) {
      assert.strictEqual(invisibleParts(cluster), undefined, cluster);
    }
  });

  test('splits an invisible character out of a cluster it joins with an ordinary character, before or after it, in their order, so it is drawn on a cell of its own, and leaves an emoji, a flag and a keycap whole, as they draw as one picture', () => {
    assert.deepStrictEqual(invisibleParts('a\u200D'), [
      { text: 'a', hidden: false },
      { text: '\u200D', hidden: true },
    ]);
    assert.deepStrictEqual(invisibleParts('|\uFE0F\uFE0F'), [
      { text: '|', hidden: false },
      { text: '\uFE0F', hidden: true },
      { text: '\uFE0F', hidden: true },
    ]);
    assert.deepStrictEqual(invisibleParts('\u0600|'), [
      { text: '\u0600', hidden: true },
      { text: '|', hidden: false },
    ]);
    assert.deepStrictEqual(invisibleParts('|\u{1F3FB}'), [
      { text: '|', hidden: false },
      { text: '\u{1F3FB}', hidden: false },
    ]);
    for (const whole of [
      '👨\u200D👩\u200D👧',
      '❤\uFE0F',
      '🏴\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}',
      '1\uFE0F⃣',
      '🇭🇺',
      '👍🏽',
    ]) {
      assert.strictEqual(invisibleParts(whole), undefined, whole);
    }
  });
});

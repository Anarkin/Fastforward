import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { suite, test } from 'vitest';
import {
  SignTips,
  signedText,
} from '../../../../../components/cells/page/signTips';

const box = { left: 10, top: 20, width: 7, height: 16 };

suite('Tooltips of the signs of the cells', () => {
  test('take the characters a cell draws as a sign, an invisible one or a space but the space, and nothing of a letter, the space or a sign of whitespace', () => {
    assert.strictEqual(signedText('\u200b'), '\u200b');
    assert.strictEqual(signedText('\u00a0'), '\u00a0');
    assert.strictEqual(signedText('\u0007'), '\u0007');
    assert.strictEqual(signedText('a'), '');
    assert.strictEqual(signedText(' '), '');
    assert.strictEqual(signedText('\t'), '');
  });

  test('stand an anchor over the cells of a sign, naming each of its characters by its code point and name, with a delay of its own, one anchor for one sign, taken away once the pointer is over none', () => {
    const { document } = new JSDOM('<!doctype html><body>').window;
    const tips = new SignTips(document);
    const first = tips.at('0:2', '\u200b', box);
    assert.ok(first);
    assert.strictEqual(
      first.getAttribute('data-tip'),
      'U+200B ZERO WIDTH SPACE',
    );
    assert.ok(first.hasAttribute('data-tip-character'));
    assert.deepStrictEqual(
      [
        first.style.left,
        first.style.top,
        first.style.width,
        first.style.height,
      ],
      ['10px', '20px', '7px', '16px'],
    );
    assert.strictEqual(tips.at('0:2', '\u200b', box), first);
    const second = tips.at('0:5', '\u00a0', box);
    assert.ok(second && second !== first);
    assert.strictEqual(first.isConnected, false);
    assert.strictEqual(tips.at('0:6', 'a', box), undefined);
    assert.strictEqual(second.isConnected, false);
    assert.strictEqual(document.querySelectorAll('[data-tip]').length, 0);
  });
});

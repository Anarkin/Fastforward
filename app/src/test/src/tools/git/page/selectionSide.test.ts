import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { suite, test } from 'vitest';
import { selectionSide } from '../../../../../tools/git/page/selectionSide';

suite('Drawing code', () => {
  test('tells which side of the side-by-side diff a selection starts on, and none outside the sides', () => {
    const { document } = new JSDOM(
      '<div class="split-line"><div class="split-side"><span class="split-code"><span class="code">old</span></span></div><div class="split-side"><span class="split-code"><span class="code">new</span></span></div></div><div class="file-header">a.txt</div>',
    ).window;
    const [left, right] = document.querySelectorAll('.code');
    assert.strictEqual(selectionSide(left), 'left');
    assert.strictEqual(selectionSide(right), 'right');
    assert.strictEqual(
      selectionSide(document.querySelector('.file-header')),
      undefined,
    );
    assert.strictEqual(selectionSide(null), undefined);
  });
});

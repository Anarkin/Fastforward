import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { proxyRatio, proxyScroll } from '../../../../lib/page/scrollProxies';

suite('A scrollbar standing in for a view that scrolls by itself', () => {
  test('is as many times longer than what it shows as the view is, so the browser draws its thumb as long as the share shown, and no longer than 4,000 times, as a file of gigabytes would ask for more pixels than a page may have', () => {
    assert.strictEqual(proxyRatio({ at: 0, length: 0.25 }), 4);
    assert.strictEqual(proxyRatio({ at: 0.5, length: 1 }), 1);
    assert.strictEqual(proxyRatio(undefined), 1);
    assert.strictEqual(proxyRatio({ at: 0, length: 1e-9 }), 4000);
    assert.strictEqual(proxyRatio({ at: 0, length: 0 }), 4000);
  });

  test('is scrolled as far through its own range as the view is through its own, wherever the view says it is, and nowhere while the view has nothing to scroll', () => {
    assert.strictEqual(proxyScroll({ at: 0.5, length: 0.25 }, 300), 450);
    assert.strictEqual(proxyScroll({ at: 1, length: 0.25 }, 300), 900);
    assert.strictEqual(proxyScroll({ at: 7, length: 0.25 }, 300), 900);
    assert.strictEqual(proxyScroll({ at: -1, length: 0.25 }, 300), 0);
    assert.strictEqual(proxyScroll(undefined, 300), 0);
    assert.strictEqual(proxyScroll({ at: 0.5, length: 1 }, 300), 0);
  });
});

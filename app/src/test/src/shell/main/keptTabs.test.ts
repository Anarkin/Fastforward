import * as assert from 'node:assert';
import { suite, test, vi } from 'vitest';
import { KeptTabs } from '../../../../shell/main/keptTabs';
import type { Page } from '../../../../shell/main/toolContract';

const pageOf = (): Page => ({ post: () => undefined, disposed: false });

const readied = (kept: KeptTabs): Page => {
  const page = pageOf();
  kept.ready(page);
  return page;
};

suite('Kept tabs', () => {
  test('hands back what a page kept of a tab with the page that kept it, the last kept winning', () => {
    const kept = new KeptTabs();
    const one = readied(kept);
    const other = readied(kept);

    assert.strictEqual(kept.keep('1', 'a', one), true);
    assert.strictEqual(kept.keep('1', 'b', other), true);

    assert.deepStrictEqual(kept.of('1'), { kept: 'b', from: other });
    assert.strictEqual(kept.of('2'), undefined);
  });

  test('hands a tab kept to every page but the one that kept it last, which holds it already', () => {
    const kept = new KeptTabs();
    const one = readied(kept);
    const other = readied(kept);
    kept.keep('1', 'a', one);

    assert.strictEqual(kept.handedTo(one, '1'), undefined);
    assert.deepStrictEqual(kept.handedTo(other, '1'), 'a');
    assert.strictEqual(kept.handedTo(other, '2'), undefined);
  });

  test('takes what a page sends before it is ready as kept by no page, as a reloading window sends what its old page kept through its new one', () => {
    const kept = new KeptTabs();
    const reloaded = pageOf();
    kept.keep('1', 'a', reloaded);
    kept.ready(reloaded);

    assert.deepStrictEqual(kept.of('1'), {
      kept: 'a',
      from: undefined,
    });
    assert.deepStrictEqual(kept.handedTo(reloaded, '1'), 'a');
  });

  test('hands a tab to every page once the page that kept it last let it go, or when no page is named as keeping it', () => {
    const kept = new KeptTabs();
    const one = readied(kept);
    kept.keep('1', 'a', one);
    kept.keep('2', 'b', undefined);

    kept.leftBy(readied(kept), '1');
    assert.strictEqual(kept.handedTo(one, '1'), undefined);
    kept.leftBy(one, '1');

    assert.deepStrictEqual(kept.handedTo(one, '1'), 'a');
    assert.deepStrictEqual(kept.handedTo(one, '2'), 'b');
  });

  test('refuses what is not a string, or a string longer than its bound, before making anything of it, keeping what it had, as the page sends what it keeps as JSON and a Map or a sparse array would pass any length measured as JSON', () => {
    const kept = new KeptTabs(20);
    const page = readied(kept);
    kept.keep('1', '{"small":1}', page);
    const sparse: unknown[] = [];
    sparse.length = 2 ** 28;
    const stringify = vi.spyOn(JSON, 'stringify');
    try {
      for (const refused of [
        'x'.repeat(21),
        undefined,
        { small: 1 },
        new Map([['a', 'x'.repeat(100)]]),
        sparse,
      ]) {
        assert.strictEqual(kept.keep('1', refused, page), false);
      }
      assert.strictEqual(stringify.mock.calls.length, 0);
    } finally {
      stringify.mockRestore();
    }

    assert.deepStrictEqual(kept.of('1'), { kept: '{"small":1}', from: page });
  });

  test('forgets a tab dropped', () => {
    const kept = new KeptTabs();
    kept.keep('1', 'a', readied(kept));

    kept.drop('1');

    assert.strictEqual(kept.of('1'), undefined);
  });
});

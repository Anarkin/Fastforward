import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { suite, test } from 'vitest';
import { scratchRange } from '../../../../shell/page/scratchRange';

suite('The range a page measures with', () => {
  test('hands out one range for every measure of a page, and one of its own to another page, so no measure leaves a range behind for the page to keep in step with its changes', () => {
    const saved: unknown = Reflect.get(globalThis, 'document');
    try {
      const one = new JSDOM('<!doctype html><p>text</p>');
      Object.assign(globalThis, { document: one.window.document });
      const first = scratchRange();
      const again = scratchRange();
      const other = new JSDOM('<!doctype html><p>text</p>');
      Object.assign(globalThis, { document: other.window.document });
      const elsewhere = scratchRange();

      assert.strictEqual(again, first);
      assert.notStrictEqual(elsewhere, first);
      assert.strictEqual(elsewhere.startContainer, other.window.document);
    } finally {
      Object.assign(globalThis, { document: saved });
    }
  });
});

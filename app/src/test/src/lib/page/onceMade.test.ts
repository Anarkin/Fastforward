import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { onceMade } from '../../../../lib/page/onceMade';

suite('Making the highlighter', () => {
  test('makes it once, but again after it failed to be made, as one failed instantiation would leave every later diff uncolored', async () => {
    let made = 0;
    const highlighter = onceMade(() => {
      made++;
      return made === 1
        ? Promise.reject(new Error('out of memory'))
        : Promise.resolve(made);
    });
    await assert.rejects(highlighter(), /out of memory/);
    assert.strictEqual(await highlighter(), 2);
    assert.strictEqual(await highlighter(), 2);
    assert.strictEqual(made, 2);
  });
});

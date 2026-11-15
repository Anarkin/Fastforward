import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { atMostEvery } from '../../../../../tools/git/page/commitPages';

suite('Asking for the pages in view', () => {
  test('asks at once, then at most once a delay however often it is asked meanwhile, and at once again after a quiet delay', async () => {
    let asked = 0;
    const ask = atMostEvery(() => asked++, 20);
    ask.schedule();
    assert.strictEqual(asked, 1);
    ask.schedule();
    ask.schedule();
    assert.strictEqual(asked, 1);
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.strictEqual(asked, 2);
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.strictEqual(asked, 2);
    ask.schedule();
    assert.strictEqual(asked, 3);
    ask.schedule();
    ask.cancel();
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.strictEqual(asked, 3);
  });
});

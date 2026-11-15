import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { resting } from '../../../../lib/page/resting';

suite('Resting', () => {
  test('acts on what the pointer rests on, not on what it only passes over', async () => {
    const done: string[] = [];
    const rest = resting(10);
    rest.start(() => done.push('a'));
    rest.start(() => done.push('b'));
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.deepStrictEqual(done, ['b']);
    rest.start(() => done.push('c'));
    rest.cancel();
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.deepStrictEqual(done, ['b']);
  });
});

import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { startAfter } from '../../../../../tools/git/page/startAfter';

suite('Commit results', () => {
  test('searches commits after a pause, stopping the search once the text changes or the popup closes, unless it never started', async () => {
    const asked: string[] = [];
    const search = () => {
      asked.push('search');
      return () => asked.push('stop');
    };
    startAfter(0, search)();
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.deepStrictEqual(asked, []);
    const cleanUp = startAfter(0, search);
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.deepStrictEqual(asked, ['search']);
    cleanUp();
    assert.deepStrictEqual(asked, ['search', 'stop']);
  });
});

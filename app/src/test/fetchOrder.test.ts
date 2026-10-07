import * as assert from 'node:assert';
import * as path from 'node:path';
import { fetchOrder } from '../autoFetch';

suite('Fetch order', () => {
  const first = path.resolve('first');
  const second = path.resolve('second');
  const third = path.resolve('third');

  test('fetches the active repository first, wherever its tab is, then the rest in tab order', () => {
    assert.deepStrictEqual(fetchOrder([first, second, third], second), [
      second,
      first,
      third,
    ]);
    assert.deepStrictEqual(fetchOrder([first, second, third], third), [
      third,
      first,
      second,
    ]);
  });

  test('finds the active repository however its folder is spelled', () => {
    assert.deepStrictEqual(
      fetchOrder([first, second], `${second}${path.sep}`),
      [second, first],
    );
  });

  test('fetches in tab order when no tab is active', () => {
    assert.deepStrictEqual(fetchOrder([first, second], undefined), [
      first,
      second,
    ]);
  });
});

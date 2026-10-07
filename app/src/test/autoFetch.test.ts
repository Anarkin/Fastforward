import * as assert from 'node:assert';
import { AutoFetch } from '../autoFetch';
import { fakeTimer } from './fakeTimer';

suite('Auto fetch', () => {
  test('fetches the repositories one after another, the interval after the last one ends', async () => {
    const { timer, waiting, fire } = fakeTimer();
    const fetched: string[] = [];
    const active = Promise.withResolvers<void>();
    const auto = new AutoFetch(
      () => 2,
      () => ['active', 'other'],
      async (root) => {
        fetched.push(`${root} started`);
        if (root === 'active') {
          await active.promise;
        }
        fetched.push(`${root} done`);
      },
      timer,
    );
    auto.update();
    assert.deepStrictEqual(
      waiting().map((entry) => entry.ms),
      [120_000],
    );
    await fire();
    assert.deepStrictEqual(fetched, ['active started']);
    assert.strictEqual(waiting().length, 0);
    active.resolve();
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepStrictEqual(fetched, [
      'active started',
      'active done',
      'other started',
      'other done',
    ]);
    assert.deepStrictEqual(
      waiting().map((entry) => entry.ms),
      [120_000],
    );
  });

  test('leaves the next round to the one running when the settings change meanwhile, so rounds never double up', async () => {
    const { timer, waiting, fire } = fakeTimer();
    const active = Promise.withResolvers<void>();
    const auto = new AutoFetch(
      () => 1,
      () => ['active'],
      () => active.promise,
      timer,
    );
    auto.update();
    await fire();
    auto.update();
    assert.strictEqual(waiting().length, 0);
    active.resolve();
    await new Promise((resolve) => setImmediate(resolve));
    assert.strictEqual(waiting().length, 1);
  });

  test('starts no second round when switched off and on again while a round runs', async () => {
    const { timer, waiting, fire } = fakeTimer();
    let minutes = 1;
    let fetches = 0;
    const active = Promise.withResolvers<void>();
    const auto = new AutoFetch(
      () => minutes,
      () => ['active'],
      () => {
        fetches += 1;
        return active.promise;
      },
      timer,
    );
    auto.update();
    await fire();
    minutes = 0;
    auto.update();
    minutes = 1;
    auto.update(true);
    await new Promise((resolve) => setImmediate(resolve));
    assert.strictEqual(fetches, 1);
    active.resolve();
    await new Promise((resolve) => setImmediate(resolve));
    assert.strictEqual(fetches, 1);
    assert.strictEqual(waiting().length, 1);
  });

  test('fetches at once when switched on, and stops when switched off', async () => {
    const { timer, waiting, fire } = fakeTimer();
    let minutes = 0;
    const fetched: string[] = [];
    const auto = new AutoFetch(
      () => minutes,
      () => ['a'],
      async (root) => {
        fetched.push(root);
      },
      timer,
    );
    auto.update();
    assert.strictEqual(waiting().length, 0);
    minutes = 1;
    auto.update(true);
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepStrictEqual(fetched, ['a']);
    assert.strictEqual(waiting().length, 1);
    minutes = 0;
    auto.update();
    assert.strictEqual(waiting().length, 0);
    minutes = 1;
    auto.update();
    await fire();
    assert.deepStrictEqual(fetched, ['a', 'a']);
  });

  test('stops a round before its next repository when switched off meanwhile', async () => {
    const { timer, waiting, fire } = fakeTimer();
    let minutes = 1;
    const fetched: string[] = [];
    const active = Promise.withResolvers<void>();
    const auto = new AutoFetch(
      () => minutes,
      () => ['active', 'other'],
      async (root) => {
        fetched.push(root);
        if (root === 'active') {
          await active.promise;
        }
      },
      timer,
    );
    auto.update();
    await fire();
    minutes = 0;
    auto.update();
    active.resolve();
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepStrictEqual(fetched, ['active']);
    assert.strictEqual(waiting().length, 0);
  });

  test('goes on after a repository fails to fetch', async () => {
    const { timer, waiting, fire } = fakeTimer();
    const fetched: string[] = [];
    const auto = new AutoFetch(
      () => 1,
      () => ['a', 'b'],
      async (root) => {
        fetched.push(root);
        if (root === 'a') {
          throw new Error('offline');
        }
      },
      timer,
    );
    auto.update();
    await fire();
    assert.deepStrictEqual(fetched, ['a', 'b']);
    assert.strictEqual(waiting().length, 1);
  });
});

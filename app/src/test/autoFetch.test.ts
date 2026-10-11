import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { AutoFetch } from '../autoFetch';
import { fakeTimer } from './fakeTimer';

suite('Auto fetch', () => {
  test('fetches the repositories one after another, the next round the interval after this one started, so the first is fetched every interval however long the others take', async () => {
    const { timer, waiting, fire } = fakeTimer();
    let now = 0;
    const fetched: string[] = [];
    const active = Promise.withResolvers<void>();
    const other = Promise.withResolvers<void>();
    const auto = new AutoFetch(
      () => 2,
      () => ['active', 'other'],
      async (root) => {
        fetched.push(`${root} started`);
        await (root === 'active' ? active : other).promise;
        fetched.push(`${root} done`);
      },
      timer,
      () => now,
      timer,
    );
    auto.update();
    assert.deepStrictEqual(
      waiting().map((entry) => entry.ms),
      [120_000],
    );
    await fire();
    assert.deepStrictEqual(fetched, ['active started']);
    now = 10_000;
    active.resolve();
    await new Promise((resolve) => setImmediate(resolve));
    now = 70_000;
    other.resolve();
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepStrictEqual(fetched, [
      'active started',
      'active done',
      'other started',
      'other done',
    ]);
    assert.deepStrictEqual(
      waiting().map((entry) => entry.ms),
      [50_000],
    );
  });

  test('moves on from a repository whose fetch outlasts the interval, skipping it in later rounds until it ends, so one hanging remote holds back no other', async () => {
    const { timer, waiting, fire } = fakeTimer();
    const fetched: string[] = [];
    const hanging = Promise.withResolvers<void>();
    const auto = new AutoFetch(
      () => 1,
      () => ['hanging', 'other'],
      async (root) => {
        fetched.push(root);
        if (root === 'hanging') {
          await hanging.promise;
        }
      },
      timer,
      () => 0,
      timer,
    );
    auto.update();
    await fire();
    assert.deepStrictEqual(fetched, ['hanging']);
    assert.deepStrictEqual(
      waiting().map((entry) => entry.ms),
      [60_000],
    );
    await fire();
    assert.deepStrictEqual(fetched, ['hanging', 'other']);
    await fire();
    assert.deepStrictEqual(fetched, ['hanging', 'other', 'other']);
    hanging.resolve();
    await new Promise((resolve) => setImmediate(resolve));
    await fire();
    assert.deepStrictEqual(fetched, [
      'hanging',
      'other',
      'other',
      'hanging',
      'other',
    ]);
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

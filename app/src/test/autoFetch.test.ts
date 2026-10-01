import * as assert from 'node:assert';
import { AutoFetch, type Timer } from '../autoFetch';

function fakeTimer() {
  const pending: { run: () => void; ms: number; cancelled: boolean }[] = [];
  const timer: Timer = (run, ms) => {
    const entry = { run, ms, cancelled: false };
    pending.push(entry);
    return () => {
      entry.cancelled = true;
    };
  };
  const waiting = () => pending.filter((entry) => !entry.cancelled);
  const fire = async () => {
    const [next] = waiting();
    assert.ok(next, 'a timer is waiting');
    next.cancelled = true;
    next.run();
    await new Promise((resolve) => setImmediate(resolve));
  };
  return { timer, waiting, fire };
}

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

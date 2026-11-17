import * as assert from 'node:assert';
import { afterEach, beforeEach, suite, test, vi } from 'vitest';
import { untilSettled } from './waits';

function reading<T>(...reads: readonly (readonly [T, number])[]) {
  let at = 0;
  return async (): Promise<T> => {
    const [value, takes] = reads[Math.min(at, reads.length - 1)];
    at += 1;
    await new Promise((resolve) => setTimeout(resolve, takes));
    return value;
  };
}

async function whenSettled<T>(waiting: Promise<T>): Promise<T> {
  const state = { ended: false };
  const end = () => {
    state.ended = true;
  };
  void waiting.then(end, end);
  while (!state.ended) {
    await vi.advanceTimersByTimeAsync(10);
  }
  return waiting;
}

suite('Waiting for what a page shows to settle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('takes a value for settled once three reads in a row gave it over the quiet time', async () => {
    const started = Date.now();
    assert.strictEqual(
      await whenSettled(untilSettled(reading(['shown', 0]), 'the value')),
      'shown',
    );
    assert.ok(Date.now() - started >= 400);
  });

  test('goes on reading after two reads alike, however far apart, as a page that stalls between them shows what it showed before for as long', async () => {
    assert.strictEqual(
      await whenSettled(
        untilSettled(
          reading(['before the key', 0], ['before the key', 600], ['after', 0]),
          'the value',
        ),
      ),
      'after',
    );
  });

  test('starts the quiet time anew once a read differs, comparing what was read rather than which object it was', async () => {
    const started = Date.now();
    assert.deepStrictEqual(
      await whenSettled(
        untilSettled(
          reading([{ row: 1 }, 0], [{ row: 1 }, 300], [{ row: 2 }, 0]),
          'the row',
          { quiet: 200 },
        ),
      ),
      { row: 2 },
    );
    assert.ok(Date.now() - started >= 500);
  });

  test('waits for a settled value to be accepted too, and says what it waited for once it gives up', async () => {
    assert.strictEqual(
      await whenSettled(
        untilSettled(
          reading(['empty', 0], ['empty', 500], ['full', 0]),
          'full',
          {
            accepted: (value) => value === 'full',
          },
        ),
      ),
      'full',
    );
    await assert.rejects(
      whenSettled(
        untilSettled(reading(['empty', 0]), 'the prompt', {
          accepted: (value) => value === 'full',
          timeout: 2000,
        }),
      ),
      /Timed out waiting for the prompt/,
    );
  });
});

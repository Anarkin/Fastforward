import * as assert from 'node:assert';
import { afterEach, suite, test, vi } from 'vitest';
import { onceQuiet } from '../../../../../tools/git/page/quietRun';

suite('Running once quiet', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test('runs once a delay has passed since it was last asked, at once when hurried while asked, and not at all once cancelled or hurried while not asked', () => {
    vi.useFakeTimers();
    let ran = 0;
    const run = onceQuiet(() => ran++, 100);
    run.schedule();
    vi.advanceTimersByTime(60);
    run.schedule();
    vi.advanceTimersByTime(60);
    assert.strictEqual(ran, 0);
    vi.advanceTimersByTime(40);
    assert.strictEqual(ran, 1);
    run.hurry();
    assert.strictEqual(ran, 1);
    run.schedule();
    run.hurry();
    assert.strictEqual(ran, 2);
    vi.advanceTimersByTime(200);
    assert.strictEqual(ran, 2);
    run.schedule();
    run.cancel();
    vi.advanceTimersByTime(200);
    assert.strictEqual(ran, 2);
  });
});

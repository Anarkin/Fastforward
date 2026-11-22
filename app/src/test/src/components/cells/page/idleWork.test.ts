import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  IdleWork,
  type IdleDeadline,
} from '../../../../../components/cells/page/idleWork';

function idling() {
  const log: string[] = [];
  const waiting: ((deadline: IdleDeadline) => void)[] = [];
  let left = 0;
  let spent = 0;
  const work = new IdleWork(
    {
      ask: (run) => waiting.push(run),
      cancel: (asked) => log.push(`cancelled what it asked ${asked}`),
    },
    (slice) => log.push(`slice of ${slice}`),
    () => log.push('done'),
    () => spent,
  );
  return {
    log,
    work,
    asked: () => waiting.length,
    spend: (ms: number) => {
      left -= ms;
      spent += ms;
    },
    idle: (ms: number) => {
      left = ms;
      waiting.at(-1)?.({ timeRemaining: () => left });
    },
  };
}

suite('Work done while the page is idle', () => {
  test('runs a job step by step while the page stays idle, then says it is done with the slice, and asks for no more time once nothing is left', () => {
    const { log, work, asked, spend, idle } = idling();
    let steps = 0;
    work.put('letters', () => {
      spend(1);
      log.push(`step ${++steps}`);
      return steps === 2;
    });

    idle(3);

    assert.deepStrictEqual(log, ['slice of 3', 'step 1', 'step 2', 'done']);
    assert.strictEqual(asked(), 1);
  });

  test('takes at most four milliseconds of an idle stretch, leaving the rest of it, and goes on in the next one', () => {
    const { log, work, asked, spend, idle } = idling();
    work.put('file', () => {
      spend(1);
      log.push('step');
      return false;
    });

    idle(50);

    assert.deepStrictEqual(log, ['slice of 4', 'step', 'step', 'step', 'done']);
    assert.strictEqual(asked(), 2);
  });

  test('does its jobs in the order they were put, a job put again under its name taking the place of the one before, after the others', () => {
    const { log, work, spend, idle } = idling();
    const job = (name: string) => () => {
      spend(1);
      log.push(name);
      return true;
    };
    work.put('rows', job('rows of before'));
    work.put('file', job('file'));
    work.put('rows', job('rows'));

    idle(4);

    assert.deepStrictEqual(log, ['slice of 4', 'file', 'rows', 'done']);
  });

  test('stops the moment the browser asks for its time back, as it does once input comes, however much of the slice is left, and goes on in the next idle stretch', () => {
    const log: string[] = [];
    const waiting: ((deadline: IdleDeadline) => void)[] = [];
    const work = new IdleWork(
      { ask: (run) => waiting.push(run), cancel: () => undefined },
      () => undefined,
      () => log.push('done'),
      () => 0,
    );
    let steps = 0;
    work.put('file', () => {
      steps++;
      if (steps > 100) {
        throw new Error('ran on though the browser asked for its time back');
      }
      return false;
    });
    const answers = [4, 0];

    waiting[0]?.({ timeRemaining: () => answers.shift() ?? 0 });

    assert.deepStrictEqual([steps, log, waiting.length], [0, ['done'], 2]);
  });

  test('drops its jobs and the idle time it asked for once cleared', () => {
    const { log, work, asked } = idling();
    work.put('rows', () => true);

    work.clear();
    work.put('rows', () => true);

    assert.deepStrictEqual(log, ['cancelled what it asked 1']);
    assert.strictEqual(asked(), 2);
  });
});

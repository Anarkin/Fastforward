import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  arrived,
  awaiting,
  forgottenAfter,
  quietFrames,
  quietTime,
  settling,
  whenSettled,
  type SettleClock,
} from '../../../../lib/page/settling';
import { posingAsElement } from '../../../helpers/fixtures';

const frameTime = 8;

function page() {
  let now = 0;
  let frames: (() => void)[] = [];
  let idles: (() => void)[] = [];
  let timers: { readonly at: number; readonly run: () => void }[] = [];
  const watchers = new Set<() => void>();
  const due = () => {
    const ripe = timers.filter((timer) => timer.at <= now);
    timers = timers.filter((timer) => timer.at > now);
    for (const timer of ripe) {
      timer.run();
    }
  };
  const clock: SettleClock = {
    now: () => now,
    frame: (run) => {
      frames.push(run);
    },
    idle: (run) => {
      idles.push(run);
    },
    after: (wait, run) => {
      const timer = { at: now + wait, run };
      timers.push(timer);
      return () => {
        timers = timers.filter((each) => each !== timer);
      };
    },
    watch: (_root, changed) => {
      watchers.add(changed);
      return () => {
        watchers.delete(changed);
      };
    },
  };
  const frame = () => {
    now += frameTime;
    due();
    const drawn = frames;
    frames = [];
    for (const run of drawn) {
      run();
    }
  };
  let settled = false;
  return {
    clock,
    watch: (within = 10_000) => {
      void whenSettled(posingAsElement({}), within, clock).then(() => {
        settled = true;
      });
    },
    frame,
    frames: (count: number) => {
      for (let index = 0; index < count; index++) {
        frame();
      }
    },
    rests: () => {
      const waiting = idles;
      idles = [];
      for (const run of waiting) {
        run();
      }
    },
    changes: () => {
      for (const changed of watchers) {
        changed();
      }
    },
    passes: (time: number) => {
      now += time;
      due();
    },
    watched: () => watchers.size,
    asksToRest: () => idles.length,
    settled: async () => {
      await Promise.resolve();
      return settled;
    },
  };
}

const framesToRest = Math.max(quietFrames, Math.ceil(quietTime / frameTime));

suite('Settling', () => {
  test('takes a page for settled once nothing of it changed for two frames and 16 ms and its thread has nothing left to run, as a tool draws itself over several frames', async () => {
    const view = page();
    view.watch();
    view.frames(framesToRest - 1);
    assert.strictEqual(view.asksToRest(), 0);
    view.frame();
    assert.strictEqual(view.asksToRest(), 1);
    assert.strictEqual(await view.settled(), false);
    view.rests();
    assert.strictEqual(await view.settled(), true);
    assert.strictEqual(view.watched(), 0);
  });

  test('starts the wait anew at each change of the page', async () => {
    const view = page();
    view.watch();
    view.frames(framesToRest - 1);
    view.changes();
    view.frames(framesToRest - 1);
    assert.strictEqual(view.asksToRest(), 0);
    view.frame();
    view.rests();
    assert.strictEqual(await view.settled(), true);
  });

  test('waits on when the page changed while its thread was still busy, as React works on what it draws next between frames without changing an element', async () => {
    const view = page();
    view.watch();
    view.frames(framesToRest);
    view.changes();
    view.rests();
    assert.strictEqual(await view.settled(), false);
    view.frames(framesToRest);
    view.rests();
    assert.strictEqual(await view.settled(), true);
  });

  test('waits for what a tool says it is waiting for, as an answer of the main process or the colors of the worker change no element until they come', async () => {
    const view = page();
    const came = settling(view.clock);
    view.watch();
    view.frames(framesToRest * 3);
    assert.strictEqual(view.asksToRest(), 0);
    came();
    view.frames(framesToRest);
    view.rests();
    assert.strictEqual(await view.settled(), true);
  });

  test('waits on when a tool started waiting while the thread was busy', async () => {
    const view = page();
    view.watch();
    view.frames(framesToRest);
    const came = settling(view.clock);
    view.rests();
    assert.strictEqual(await view.settled(), false);
    came();
    came();
    view.frames(framesToRest);
    view.rests();
    assert.strictEqual(await view.settled(), true);
  });

  test('waits for a thing by its name until it arrives, asked for again or not, as a tool asks for its rows again before the first came', async () => {
    const view = page();
    awaiting('rows', view.clock);
    awaiting('rows', view.clock);
    view.watch();
    view.frames(framesToRest * 2);
    assert.strictEqual(view.asksToRest(), 0);
    arrived('rows');
    arrived('rows');
    view.frames(framesToRest);
    view.rests();
    assert.strictEqual(await view.settled(), true);
  });

  test('takes a page for settled after the time it was given, so a tool that never rests holds a switch no longer', async () => {
    const view = page();
    const came = settling(view.clock);
    view.watch(300);
    view.passes(299);
    assert.strictEqual(await view.settled(), false);
    view.passes(1);
    assert.strictEqual(await view.settled(), true);
    assert.strictEqual(view.watched(), 0);
    came();
  });

  test('forgets what never came after two seconds, so an answer lost holds no later switch', async () => {
    const view = page();
    settling(view.clock);
    view.passes(forgottenAfter);
    view.watch();
    view.frames(framesToRest);
    view.rests();
    assert.strictEqual(await view.settled(), true);
  });
});

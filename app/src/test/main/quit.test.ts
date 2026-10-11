import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  exitOnFailure,
  flushBeforeQuit,
  whileWindowOpen,
} from '../../main/quit';

const settle = () => new Promise((resolve) => setImmediate(resolve));

suite('Quitting', () => {
  test('waits for what is being saved before it quits, however it was asked to, as Cmd+Q and app.quit() skip window-all-closed', async () => {
    let quitting: ((event: { preventDefault(): void }) => void) | undefined;
    let quits = 0;
    const app = {
      on: (_event: 'will-quit', listener: typeof quitting) => {
        quitting = listener;
      },
      quit: () => {
        quits += 1;
      },
      releaseSingleInstanceLock: () => {},
    };
    const saved = Promise.withResolvers<void>();
    flushBeforeQuit(
      app,
      () => saved.promise,
      () => Promise.resolve(),
    );
    let prevented = 0;
    const event = {
      preventDefault: () => {
        prevented += 1;
      },
    };
    quitting?.(event);
    assert.strictEqual(prevented, 1);
    assert.strictEqual(quits, 0);
    saved.resolve();
    await settle();
    assert.strictEqual(quits, 1);
    quitting?.(event);
    assert.strictEqual(prevented, 1);
  });

  test('lets the app start again once what is being saved is saved, while git may still be finishing a checkout, as the instance started meanwhile found this one running and quit, so starting the app again or restarting into an update opened nothing', async () => {
    let quitting: ((event: { preventDefault(): void }) => void) | undefined;
    const steps: string[] = [];
    const app = {
      on: (_event: 'will-quit', listener: typeof quitting) => {
        quitting = listener;
      },
      quit: () => steps.push('quit'),
      releaseSingleInstanceLock: () => steps.push('released'),
    };
    const saved = Promise.withResolvers<void>();
    const stopped = Promise.withResolvers<void>();
    flushBeforeQuit(
      app,
      () => saved.promise,
      () => stopped.promise,
    );
    quitting?.({ preventDefault: () => {} });
    await settle();
    assert.deepStrictEqual(steps, []);
    saved.resolve();
    await settle();
    assert.deepStrictEqual(steps, ['released']);
    stopped.resolve();
    await settle();
    assert.deepStrictEqual(steps, ['released', 'quit']);
  });

  test('says why it could not start and exits, as a process left without a window would keep the app from starting again', async () => {
    const exits: number[] = [];
    const said: unknown[] = [];
    const app = { exit: (code: number) => exits.push(code) };
    const failure = new Error('disk full');
    await exitOnFailure(app, Promise.resolve(), (error) => said.push(error));
    assert.deepStrictEqual(exits, []);
    await exitOnFailure(app, Promise.reject(failure), (error) =>
      said.push(error),
    );
    assert.deepStrictEqual(said, [failure]);
    assert.deepStrictEqual(exits, [1]);
  });
});

suite('Watching for the window', () => {
  test('stops watching once the window closes, and does nothing for a change told after it is gone', () => {
    const closing: (() => void)[] = [];
    let destroyed = false;
    const window = {
      isDestroyed: () => destroyed,
      once: (_event: 'closed', listener: () => void) => {
        closing.push(listener);
      },
    };
    const applied: string[] = [];
    let changed: ((change: string) => void) | undefined;
    let stopped = 0;
    whileWindowOpen(window, (ifOpen) => {
      changed = (change) => ifOpen(() => applied.push(change));
      return () => {
        stopped++;
      };
    });
    changed?.('settings');
    destroyed = true;
    changed?.('too late');
    for (const listener of closing) {
      listener();
    }
    assert.deepStrictEqual(applied, ['settings']);
    assert.strictEqual(stopped, 1);
  });
});

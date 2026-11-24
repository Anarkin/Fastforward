import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { exitOnFailure, flushBeforeQuit } from '../../../boot/quit';

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
      relaunch: () => {},
    };
    const saved = Promise.withResolvers<void>();
    flushBeforeQuit(
      app,
      () => {},
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

  test('waits for what must end before quitting, as an edited file being put back into its archive, before it ends anything else, as quitting killed the put-back and the archive never got the edits', async () => {
    let quitting: ((event: { preventDefault(): void }) => void) | undefined;
    const steps: string[] = [];
    const app = {
      on: (_event: 'will-quit', listener: typeof quitting) => {
        quitting = listener;
      },
      quit: () => steps.push('quit'),
      releaseSingleInstanceLock: () => steps.push('released'),
      relaunch: () => {},
    };
    const waited = Promise.withResolvers<void>();
    flushBeforeQuit(
      app,
      () => steps.push('ended'),
      () => Promise.resolve(),
      () => Promise.resolve(),
      () => waited.promise,
    );
    quitting?.({ preventDefault: () => {} });
    quitting?.({ preventDefault: () => {} });
    await settle();
    assert.deepStrictEqual(steps, []);
    waited.resolve();
    await settle();
    assert.deepStrictEqual(steps, ['ended', 'released', 'quit']);
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
      relaunch: () => {},
    };
    const saved = Promise.withResolvers<void>();
    const stopped = Promise.withResolvers<void>();
    flushBeforeQuit(
      app,
      () => {},
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

  test('lets the tools end what they do once before waiting for what is being saved, saving and quitting once however often it is asked, as the times of the last fetches the git tool writes as it quits were left out of the state saved', async () => {
    let quitting: ((event: { preventDefault(): void }) => void) | undefined;
    const steps: string[] = [];
    const app = {
      on: (_event: 'will-quit', listener: typeof quitting) => {
        quitting = listener;
      },
      quit: () => steps.push('quit'),
      releaseSingleInstanceLock: () => {},
      relaunch: () => {},
    };
    flushBeforeQuit(
      app,
      () => steps.push('tools quit'),
      () => {
        steps.push('saved');
        return Promise.resolve();
      },
      () => Promise.resolve(),
    );
    quitting?.({ preventDefault: () => {} });
    quitting?.({ preventDefault: () => {} });
    await settle();
    quitting?.({ preventDefault: () => {} });
    assert.deepStrictEqual(steps, ['tools quit', 'saved', 'quit']);
  });

  test('starts the app again once it has quit for a start asked for while it quits, with what that start asked for, once however often it is asked, as such a start handed itself to the app quitting and opened nothing; and leaves a start asked for before quitting to the app running', async () => {
    let quitting: ((event: { preventDefault(): void }) => void) | undefined;
    const relaunched: (readonly string[])[] = [];
    const app = {
      on: (_event: 'will-quit', listener: typeof quitting) => {
        quitting = listener;
      },
      quit: () => {},
      releaseSingleInstanceLock: () => {},
      relaunch: ({ args }: { readonly args: string[] }) => {
        relaunched.push(args);
      },
    };
    const waited = Promise.withResolvers<void>();
    const quit = flushBeforeQuit(
      app,
      () => {},
      () => Promise.resolve(),
      () => Promise.resolve(),
      () => waited.promise,
    );
    assert.strictEqual(quit.startedAgainAfter(['--', 'first']), false);
    quitting?.({ preventDefault: () => {} });
    assert.strictEqual(quit.startedAgainAfter(['--', 'asked']), true);
    assert.strictEqual(quit.startedAgainAfter(['--', 'again']), true);
    waited.resolve();
    await settle();
    assert.deepStrictEqual(relaunched, [['--', 'asked']]);
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

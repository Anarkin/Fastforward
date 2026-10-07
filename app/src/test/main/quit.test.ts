import * as assert from 'node:assert';
import { exitOnFailure, flushBeforeQuit } from '../../main/quit';

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
    };
    const saved = Promise.withResolvers<void>();
    flushBeforeQuit(app, () => saved.promise);
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
    await saved.promise;
    await Promise.resolve();
    assert.strictEqual(quits, 1);
    quitting?.(event);
    assert.strictEqual(prevented, 1);
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

import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { QuitGuard } from '../../main/quitGuard';
import { fakeTimer } from '../fakeTimer';

function guarded(asks = true, timer = fakeTimer().timer) {
  const done: string[] = [];
  const shell = {
    asksBeforeQuit: () => asks,
    askToQuit: () => done.push('asked'),
  };
  const guard = new QuitGuard(() => shell, timer);
  return { guard, done };
}

suite('Quit guard', () => {
  test('holds a quit while the shell asks before quitting, asking the page, and goes on with it once the page confirms', () => {
    const { guard, done } = guarded();
    assert.strictEqual(
      guard.holds(() => done.push('quit')),
      true,
    );
    assert.deepStrictEqual(done, ['asked']);
    guard.confirmed();
    assert.deepStrictEqual(done, ['asked', 'quit']);
    assert.strictEqual(
      guard.holds(() => done.push('again')),
      false,
    );
  });

  test('goes on with the last quit held, as Restart to Update rather than quitting', () => {
    const { guard, done } = guarded();
    guard.holds(() => done.push('quit'));
    guard.holds(() => done.push('update'));
    guard.confirmed();
    assert.deepStrictEqual(done, ['asked', 'asked', 'update']);
  });

  test('takes no confirmation from the page while it asked nothing, as the page is not trusted', () => {
    const { guard, done } = guarded();
    guard.confirmed();
    assert.strictEqual(done.length, 0);
    assert.strictEqual(
      guard.holds(() => done.push('quit')),
      true,
    );
  });

  test('lets a quit go on when nothing asks, when the system shuts down or logs off, while the page hangs or once the app restarts to build anew', () => {
    assert.strictEqual(
      guarded(false).guard.holds(() => undefined),
      false,
    );
    const ending = guarded().guard;
    ending.systemEnding();
    assert.strictEqual(
      ending.holds(() => undefined),
      false,
    );
    const hung = guarded().guard;
    hung.responsive(false);
    assert.strictEqual(
      hung.holds(() => undefined),
      false,
    );
    hung.responsive(true);
    assert.strictEqual(
      hung.holds(() => undefined),
      true,
    );
    const rebuilt = guarded().guard;
    rebuilt.allow();
    assert.strictEqual(
      rebuilt.holds(() => undefined),
      false,
    );
    assert.strictEqual(
      new QuitGuard(() => undefined).holds(() => undefined),
      false,
    );
  });

  test('asks before quitting again a while after the system said it would shut down or log off, as another app may have stopped it, and quitting went on unasked for the rest of the run', async () => {
    const { timer, waiting, fire } = fakeTimer();
    const { guard } = guarded(true, timer);
    guard.systemEnding();
    assert.strictEqual(
      guard.holds(() => undefined),
      false,
    );
    guard.systemEnding();
    assert.deepStrictEqual(
      waiting().map((entry) => entry.ms),
      [10_000],
    );
    await fire();
    assert.strictEqual(
      guard.holds(() => undefined),
      true,
    );
  });
});

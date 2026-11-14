import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { QuitGuard } from '../../../boot/quitGuard';
import { fakeTimer } from '../../helpers/fakeTimer';

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

  test('holds every window a quit closes once it holds the quit for one, asking once, as the windows closed after it dropped their tabs from those kept for the next start, and closes a window alone once that quit is over', async () => {
    const { timer, fire } = fakeTimer();
    const { guard, done } = guarded(true, timer);
    assert.strictEqual(
      guard.closing(false, () => done.push('quit')),
      'alone',
    );
    guard.quitStarts();
    assert.strictEqual(
      guard.closing(false, () => done.push('quit')),
      'held',
    );
    assert.strictEqual(
      guard.closing(false, () => done.push('quit')),
      'held',
    );
    assert.deepStrictEqual(done, ['asked']);
    await fire();
    assert.strictEqual(
      guard.closing(false, () => done.push('quit')),
      'alone',
    );
    assert.strictEqual(
      guard.closing(true, () => done.push('quit')),
      'held',
    );
    guard.confirmed();
    assert.deepStrictEqual(done, ['asked', 'asked', 'quit']);
    guard.quitStarts();
    assert.strictEqual(
      guard.closing(false, () => done.push('again')),
      'quits',
    );
    assert.strictEqual(
      guarded(false).guard.closing(true, () => undefined),
      'quits',
    );
  });

  test('goes on with the last quit held, as Restart to Update rather than quitting', () => {
    const { guard, done } = guarded();
    guard.holds(() => done.push('quit'));
    guard.holds(() => done.push('update'));
    guard.confirmed();
    assert.deepStrictEqual(done, ['asked', 'asked', 'update']);
  });

  test('asks again before quitting once what it let go on left the app running, as a Restart to Update whose install failed let every later close go unasked', () => {
    const { guard, done } = guarded();
    guard.holds(() => done.push('update'));
    guard.confirmed();
    guard.reset();

    assert.strictEqual(
      guard.holds(() => done.push('quit')),
      true,
    );
    assert.deepStrictEqual(done, ['asked', 'update', 'asked']);
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
    hung.responsive('1', false);
    assert.strictEqual(
      hung.holds(() => undefined),
      false,
    );
    hung.responsive('1', true);
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

  test('lets a quit go on while any window hangs, not only the last one to say so, and forgets a window once it is gone, as one closed while it hung let every later quit go unasked', () => {
    const { guard } = guarded();
    guard.responsive('1', false);
    guard.responsive('2', false);
    guard.responsive('2', true);
    assert.strictEqual(
      guard.holds(() => undefined),
      false,
    );
    guard.forget('1');
    assert.strictEqual(
      guard.holds(() => undefined),
      true,
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

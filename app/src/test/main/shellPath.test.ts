import * as assert from 'node:assert';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { suite, test } from 'vitest';
import {
  loginShellOptions,
  mergePaths,
  pathFromOutput,
  pathFromShell,
  withLoginShellPath,
} from '../../main/shellPath';
import { fakeTimer } from '../fakeTimer';

const pathOn = (platform: NodeJS.Platform) => {
  const env: NodeJS.ProcessEnv = { PATH: '/usr/bin' };
  return withLoginShellPath(platform, env, () =>
    Promise.resolve('/opt/homebrew/bin'),
  ).then(() => env.PATH);
};

suite('Login shell PATH', () => {
  test('starts the shell in a session of its own, away from the terminal the app may have been started from, as an interactive shell in the background stops its whole process group with SIGTTIN, the app included, and one in the foreground takes the terminal over, keeping it once killed', () => {
    assert.strictEqual(loginShellOptions({}).detached, true);
  });

  test('gives up after 5 seconds on a shell that never prints the PATH, killing it for good, as a profile waiting for input would keep the window from opening, and an interactive shell ignores SIGTERM', async () => {
    const signals: unknown[] = [];
    const stdout = new PassThrough();
    stdout.write('Update now? [y/N] ');
    const shell = Object.assign(new EventEmitter(), {
      stdout,
      kill: (signal: unknown) => signals.push(signal) > 0,
    });
    const { timer, waiting, fire } = fakeTimer();
    const found = pathFromShell(shell, timer);
    assert.deepStrictEqual(
      waiting().map((entry) => entry.ms),
      [5000],
    );
    await fire();
    assert.strictEqual(await found, undefined);
    assert.deepStrictEqual(signals, ['SIGKILL']);
    assert.ok(stdout.destroyed);
  });

  test('lets go of the output of a shell once it prints the PATH, which what its profile starts in the background can hold open long after the shell is gone', async () => {
    const stdout = new PassThrough();
    const shell = Object.assign(new EventEmitter(), {
      stdout,
      kill: () => true,
    });
    const found = pathFromShell(shell, fakeTimer().timer);
    stdout.write('__FASTFORWARD_PATH__/usr/bin__FASTFORWARD_PATH__');
    assert.strictEqual(await found, '/usr/bin');
    assert.ok(stdout.destroyed);
  });

  test("reads the PATH between the markers, past what the shell's profile prints", () => {
    assert.strictEqual(
      pathFromOutput(
        'Welcome!\n__FASTFORWARD_PATH__/opt/homebrew/bin:/usr/bin__FASTFORWARD_PATH__',
      ),
      '/opt/homebrew/bin:/usr/bin',
    );
    assert.strictEqual(pathFromOutput(''), undefined);
    assert.strictEqual(pathFromOutput('__FASTFORWARD_PATH__'), undefined);
  });

  test('reads the login shell PATH on macOS and Linux only, putting its folders first, as an app started from the Dock or a launcher lacks what the profile sets', async () => {
    assert.strictEqual(await pathOn('darwin'), '/opt/homebrew/bin:/usr/bin');
    assert.strictEqual(await pathOn('linux'), '/opt/homebrew/bin:/usr/bin');
    assert.strictEqual(await pathOn('win32'), '/usr/bin');
  });

  test('puts the shell folders first, without repeating any', () => {
    assert.strictEqual(
      mergePaths('/opt/homebrew/bin:/usr/bin', '/usr/bin:/bin', ':'),
      '/opt/homebrew/bin:/usr/bin:/bin',
    );
    assert.strictEqual(mergePaths(undefined, '/usr/bin', ':'), '/usr/bin');
  });
});

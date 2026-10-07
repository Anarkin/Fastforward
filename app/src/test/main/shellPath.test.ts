import * as assert from 'node:assert';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import {
  mergePaths,
  pathFromOutput,
  pathFromShell,
} from '../../main/shellPath';

suite('Login shell PATH', () => {
  test('gives up on a shell that never prints the PATH, killing it for good, as an interactive shell ignores SIGTERM', async () => {
    const signals: unknown[] = [];
    const stdout = new PassThrough();
    stdout.write('Update now? [y/N] ');
    const shell = Object.assign(new EventEmitter(), {
      stdout,
      kill: (signal: unknown) => signals.push(signal) > 0,
    });
    assert.strictEqual(await pathFromShell(shell, 10), undefined);
    assert.deepStrictEqual(signals, ['SIGKILL']);
    assert.ok(stdout.destroyed);
  });

  test('lets go of the output of a shell once it prints the PATH, which what its profile starts in the background can hold open long after the shell is gone', async () => {
    const stdout = new PassThrough();
    const shell = Object.assign(new EventEmitter(), {
      stdout,
      kill: () => true,
    });
    const found = pathFromShell(shell, 10_000);
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

  test('puts the shell folders first, without repeating any', () => {
    assert.strictEqual(
      mergePaths('/opt/homebrew/bin:/usr/bin', '/usr/bin:/bin', ':'),
      '/opt/homebrew/bin:/usr/bin:/bin',
    );
    assert.strictEqual(mergePaths(undefined, '/usr/bin', ':'), '/usr/bin');
  });
});

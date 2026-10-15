import * as assert from 'node:assert';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { suite, test } from 'vitest';
import {
  envFromOutput,
  envFromShell,
  loginShellOptions,
  mergePaths,
  withLoginShellEnv,
} from '../../main/shellPath';
import { fakeTimer } from '../fakeTimer';

const envOn = async (platform: NodeJS.Platform) => {
  const env: NodeJS.ProcessEnv = {
    PATH: '/usr/bin',
    SSH_AUTH_SOCK: '/launchd/Listeners',
    EDITOR: 'nano',
  };
  await withLoginShellEnv(platform, env, () =>
    Promise.resolve({
      PATH: '/opt/homebrew/bin',
      SSH_AUTH_SOCK: '/agent.sock',
      HTTPS_PROXY: 'http://proxy:8080',
    }),
  );
  return env;
};

const printed = (...entries: string[]) =>
  ['__FASTFORWARD_ENV__', ...entries, '__FASTFORWARD_ENV__', ''].join('\0');

suite('Login shell environment', () => {
  test('starts the shell in a session of its own, away from the terminal the app may have been started from, as an interactive shell in the background stops its whole process group with SIGTTIN, the app included, and one in the foreground takes the terminal over, keeping it once killed', () => {
    assert.strictEqual(loginShellOptions({}).detached, true);
  });

  test('gives up after 5 seconds on a shell that never prints its environment, killing it for good, as a profile waiting for input would keep the window from opening, and an interactive shell ignores SIGTERM', async () => {
    const signals: unknown[] = [];
    const stdout = new PassThrough();
    stdout.write('Update now? [y/N] ');
    const shell = Object.assign(new EventEmitter(), {
      stdout,
      kill: (signal: unknown) => signals.push(signal) > 0,
    });
    const { timer, waiting, fire } = fakeTimer();
    const found = envFromShell(shell, timer);
    assert.deepStrictEqual(
      waiting().map((entry) => entry.ms),
      [5000],
    );
    await fire();
    assert.strictEqual(await found, undefined);
    assert.deepStrictEqual(signals, ['SIGKILL']);
    assert.ok(stdout.destroyed);
  });

  test('lets go of the output of a shell once it prints its environment, which what its profile starts in the background can hold open long after the shell is gone', async () => {
    const stdout = new PassThrough();
    const shell = Object.assign(new EventEmitter(), {
      stdout,
      kill: () => true,
    });
    const found = envFromShell(shell, fakeTimer().timer);
    stdout.write(printed('PATH=/usr/bin'));
    assert.deepStrictEqual(await found, { PATH: '/usr/bin' });
    assert.ok(stdout.destroyed);
  });

  test("reads the variables between the markers, past what the shell's profile prints, leaving out those it left empty", () => {
    assert.deepStrictEqual(
      envFromOutput(
        `Welcome!\n${printed('PATH=/opt/homebrew/bin:/usr/bin', 'SSH_AUTH_SOCK=/a=b.sock', 'HTTPS_PROXY=')}`,
      ),
      { PATH: '/opt/homebrew/bin:/usr/bin', SSH_AUTH_SOCK: '/a=b.sock' },
    );
    assert.strictEqual(envFromOutput(''), undefined);
    assert.strictEqual(envFromOutput(printed().slice(0, 20)), undefined);
  });

  test("takes on macOS and Linux only what the profile sets for git, ssh and proxies over what the launcher gave, putting the profile's PATH folders first, as an app started from the Dock or a launcher lacks what the profile sets", async () => {
    for (const platform of ['darwin', 'linux'] as const) {
      assert.deepStrictEqual(await envOn(platform), {
        PATH: '/opt/homebrew/bin:/usr/bin',
        SSH_AUTH_SOCK: '/agent.sock',
        HTTPS_PROXY: 'http://proxy:8080',
        EDITOR: 'nano',
      });
    }
    assert.deepStrictEqual(await envOn('win32'), {
      PATH: '/usr/bin',
      SSH_AUTH_SOCK: '/launchd/Listeners',
      EDITOR: 'nano',
    });
  });

  test('puts the shell folders first, without repeating any', () => {
    assert.strictEqual(
      mergePaths('/opt/homebrew/bin:/usr/bin', '/usr/bin:/bin', ':'),
      '/opt/homebrew/bin:/usr/bin:/bin',
    );
    assert.strictEqual(mergePaths(undefined, '/usr/bin', ':'), '/usr/bin');
  });
});

import * as assert from 'node:assert';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createInterface } from 'node:readline';
import { suite, test } from 'vitest';
import { gitProcessOptions } from '../../../../../tools/git/main/gitCommand';
import { stopGit } from '../../../../../tools/git/main/gitProcesses';
import { waitFor } from '../../../../helpers/fixtures';
import {
  removeFolder,
  tempFolder,
  withEnv,
} from '../../../../helpers/repositories';

suite('Running git', () => {
  test('starts git in a process group of its own outside Windows and stops the whole group, as git leaves running the ssh or https helper it started', async () => {
    assert.strictEqual(gitProcessOptions('win32').detached, false);
    assert.strictEqual(gitProcessOptions('linux').detached, true);
    const killed: unknown[][] = [];
    const kill = process.kill.bind(process);
    process.kill = (...args: Parameters<typeof process.kill>) => {
      killed.push(args);
      return true;
    };
    try {
      await stopGit(
        {
          pid: 4321,
          exitCode: null,
          signalCode: null,
          stdout: null,
          stderr: null,
          kill: () => true,
        },
        'linux',
      );
    } finally {
      process.kill = kill;
    }
    assert.deepStrictEqual(killed, [[-4321, 'SIGTERM']]);
  });

  test(
    "stops what git started too, as the real git outlives Git for Windows' launcher being killed",
    { timeout: 20_000 },
    async (context) => {
      if (process.platform !== 'win32') {
        context.skip();
      }
      const [outlived] = await Promise.all([
        outlivesKilledLauncher(),
        stopsWhatItStarted(),
      ]);
      assert.ok(outlived, 'what the launcher started to outlive it');
    },
  );

  test(
    'stops git with the system taskkill, not one in the current folder',
    { timeout: 20_000 },
    async (context) => {
      if (process.platform !== 'win32') {
        context.skip();
      }
      const folder = tempFolder('run');
      fs.copyFileSync(
        path.join(
          process.env.SystemRoot ?? 'C:\\Windows',
          'System32',
          'hostname.exe',
        ),
        path.join(folder, 'taskkill.exe'),
      );
      const cwd = process.cwd();
      process.chdir(folder);
      try {
        await withEnv(
          { NoDefaultCurrentDirectoryInExePath: undefined },
          stopsWhatItStarted,
        );
      } finally {
        process.chdir(cwd);
        removeFolder(folder);
      }
    },
  );
});

async function stopsWhatItStarted(): Promise<void> {
  const { launcher, started } = await startLauncher();
  try {
    await stopGit(launcher);
    await waitFor(
      () => !running(launcher.pid!) && !running(started),
      'the launcher and what it started to stop',
      5_000,
    );
  } finally {
    stop(launcher.pid!);
    stop(started);
  }
}

async function outlivesKilledLauncher(): Promise<boolean> {
  const { launcher, started } = await startLauncher();
  try {
    launcher.kill();
    await once(launcher, 'close');
    return running(started);
  } finally {
    stop(started);
  }
}

const launcherOutlivedByWhatItStarts = `
const child = require('node:child_process').spawn(
  process.execPath,
  ['-e', 'setInterval(() => {}, 60_000)'],
  { detached: true, stdio: 'ignore', windowsHide: true },
);
console.log(child.pid);
setInterval(() => {}, 60_000);
`;

async function startLauncher(): Promise<{
  launcher: ChildProcess;
  started: number;
}> {
  const launcher = spawn(
    process.execPath,
    ['-e', launcherOutlivedByWhatItStarts],
    {
      windowsHide: true,
    },
  );
  const line = await new Promise<string>((resolve) =>
    createInterface(launcher.stdout).once('line', resolve),
  );
  return { launcher, started: Number(line) };
}

function running(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function stop(pid: number): void {
  if (running(pid)) {
    process.kill(pid);
  }
}

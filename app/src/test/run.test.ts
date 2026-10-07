import * as assert from 'node:assert';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createInterface } from 'node:readline';
import { exitedWith, gitEnv, stopGit } from '../git/run';
import { waitFor } from './fixtures';
import { removeFolder, tempFolder } from './repositories';

suite('Running git', () => {
  test('takes only the exit codes asked for as success', () => {
    assert.ok(exitedWith({ code: 1 }, [0, 1]));
    assert.ok(!exitedWith({ code: 128 }, [0, 1]));
    assert.ok(!exitedWith({ code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' }, [0]));
  });

  test('fails a git killed by a signal, whose output may be cut short', () => {
    assert.ok(!exitedWith({ code: null }, [0]));
    assert.ok(!exitedWith({}, [0]));
  });

  test('runs git without prompting for credentials', () => {
    assert.strictEqual(gitEnv().GIT_TERMINAL_PROMPT, '0');
  });

  test('takes paths literally unless asked for pathspec magic', () => {
    assert.strictEqual(gitEnv().GIT_LITERAL_PATHSPECS, '1');
    assert.strictEqual(gitEnv(true).GIT_LITERAL_PATHSPECS, '0');
  });

  test("stops what git started too, as the real git outlives Git for Windows' launcher being killed", async function () {
    if (process.platform !== 'win32') {
      this.skip();
    }
    this.timeout(20_000);
    const [outlived] = await Promise.all([
      outlivesKilledLauncher(),
      stopsWhatItStarted(),
    ]);
    assert.ok(outlived);
  });

  test('stops git with the system taskkill, not one in the current folder', async function () {
    if (process.platform !== 'win32') {
      this.skip();
    }
    this.timeout(20_000);
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
    const noCurrent = process.env.NoDefaultCurrentDirectoryInExePath;
    delete process.env.NoDefaultCurrentDirectoryInExePath;
    process.chdir(folder);
    try {
      await stopsWhatItStarted();
    } finally {
      process.chdir(cwd);
      if (noCurrent !== undefined) {
        process.env.NoDefaultCurrentDirectoryInExePath = noCurrent;
      }
      removeFolder(folder);
    }
  });
});

async function stopsWhatItStarted(): Promise<void> {
  const { launcher, started } = await startLauncher();
  try {
    stopGit(launcher);
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

// Node stops the children it did not detach when it exits, which Git for
// Windows' launcher does not
const launcherScript = `
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
  const launcher = spawn(process.execPath, ['-e', launcherScript], {
    windowsHide: true,
  });
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

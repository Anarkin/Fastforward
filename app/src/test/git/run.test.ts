import * as assert from 'node:assert';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createInterface } from 'node:readline';
import {
  exitedWith,
  gitEnv,
  gitProcessOptions,
  realGit,
  stopGit,
} from '../../git/run';
import { waitFor } from '../fixtures';
import { removeFolder, tempFolder, withEnv } from '../repositories';

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

  test('lets git fill its output buffer instead of flushing it after every commit', () => {
    assert.strictEqual(gitEnv().GIT_FLUSH, '0');
  });

  test('takes paths literally unless asked for pathspec magic', () => {
    assert.strictEqual(gitEnv().GIT_LITERAL_PATHSPECS, '1');
    assert.strictEqual(gitEnv(true).GIT_LITERAL_PATHSPECS, '0');
  });

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

  test("runs the real git Git for Windows' launcher starts, with the MSYSTEM and the PATH the launcher gives it", () => {
    const root = 'C:\\Program Files\\Git';
    const present = new Set([
      `${root}\\usr\\bin\\sh.exe`,
      `${root}\\ucrt64\\bin\\git.exe`,
      `${root}\\mingw64\\bin\\git.exe`,
    ]);
    const exists = (file: string) => present.has(file);
    assert.deepStrictEqual(
      realGit(
        `${root}\\cmd\\git.exe`,
        { Path: 'C:\\Windows', USERPROFILE: 'C:\\Users\\me' },
        'win32',
        exists,
      ),
      {
        command: `${root}\\ucrt64\\bin\\git.exe`,
        env: {
          MSYSTEM: 'UCRT64',
          Path: `${root}\\ucrt64\\bin;${root}\\usr\\bin;C:\\Users\\me\\bin;C:\\Windows`,
        },
      },
    );
    present.add('H:\\home');
    assert.strictEqual(
      realGit(
        `${root}\\cmd\\git.exe`,
        {
          Path: 'C:\\Windows',
          HOMEDRIVE: 'H:',
          HOMEPATH: '\\home',
          USERPROFILE: 'C:\\Users\\me',
        },
        'win32',
        exists,
      )?.env.Path,
      `${root}\\ucrt64\\bin;${root}\\usr\\bin;H:\\home\\bin;C:\\Windows`,
    );
    present.delete(`${root}\\ucrt64\\bin\\git.exe`);
    assert.deepStrictEqual(
      realGit(
        `${root}\\CMD\\Git.exe`,
        { PATH: 'C:\\Windows', HOME: 'D:\\home', MSYSTEM: 'MINGW32' },
        'win32',
        exists,
      ),
      {
        command: `${root}\\mingw64\\bin\\git.exe`,
        env: {
          MSYSTEM: 'MINGW32',
          PATH: `${root}\\mingw64\\bin;${root}\\usr\\bin;D:\\home\\bin;C:\\Windows`,
        },
      },
    );
  });

  test('runs git as found when it is no launcher of a Git for Windows it knows, or outside Windows', () => {
    const root = 'C:\\Program Files\\Git';
    assert.strictEqual(
      realGit(`${root}\\bin\\git.exe`, {}, 'win32', () => true),
      undefined,
    );
    assert.strictEqual(
      realGit(`${root}\\cmd\\git.exe`, {}, 'win32', () => false),
      undefined,
    );
    assert.strictEqual(
      realGit(
        `${root}\\cmd\\git.exe`,
        {},
        'win32',
        (file) => !file.endsWith('sh.exe'),
      ),
      undefined,
    );
    assert.strictEqual(
      realGit('/usr/bin/git', {}, 'linux', () => true),
      undefined,
    );
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
  });
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

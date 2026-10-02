import * as assert from 'node:assert';
import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { exitedWith, gitConfigArgs, gitEnv, stopGit } from '../git/run';

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

  test('runs git without its optional locks or index refresh, and without prompting for credentials', () => {
    const env = gitEnv();
    assert.strictEqual(env.GIT_OPTIONAL_LOCKS, '0');
    assert.strictEqual(env.GIT_TERMINAL_PROMPT, '0');
    assert.ok(gitConfigArgs.includes('diff.autoRefreshIndex=false'));
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
    await stopsWhatItStarted();
  });

  test('stops git with the system taskkill, not one in the current folder', async function () {
    if (process.platform !== 'win32') {
      this.skip();
    }
    this.timeout(20_000);
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'fastforward-run-'));
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
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });
});

async function stopsWhatItStarted(): Promise<void> {
  const launcher = spawn('cmd.exe', ['/c', 'ping -n 60 127.0.0.1 > nul'], {
    windowsHide: true,
  });
  let started: string[] = [];
  while (started.length === 0) {
    started = await powershell(
      `(Get-CimInstance Win32_Process -Filter "ParentProcessId=${launcher.pid}").ProcessId`,
    );
  }
  stopGit(launcher);
  await once(launcher, 'close');
  assert.deepStrictEqual(
    await powershell(
      `(Get-Process -Id ${started.join(',')} -ErrorAction SilentlyContinue).Id`,
    ),
    [],
  );
}

function powershell(command: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-Command', command],
      { windowsHide: true },
      (error, stdout) =>
        error ? reject(error) : resolve(stdout.split(/\s+/).filter(Boolean)),
    );
  });
}

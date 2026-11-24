import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { replaceBuiltin } from '../../../../helpers/builtins';
import { fastForward } from '../../../../../tools/git/main/branches';
import { switchToBranch } from '../../../../../tools/git/main/switches';
import {
  writesEnded,
  writesRunning,
} from '../../../../../tools/git/main/gitProcesses';
import { runGit, stopRunningGit } from '../../../../../tools/git/main/run';
import { waitFor } from '../../../../helpers/fixtures';
import {
  tempRepository,
  type TempRepository,
} from '../../../../helpers/repositories';
import {
  heldHook,
  settledYet,
  stoppedAtOnce,
  filteredSlowly,
  stuckWriting,
} from './runFixtures';
import { removeFolder, tempFolder } from '../../../../helpers/tempFolders';

suite('Running git in a repository', () => {
  let gitPath: string;
  let temp: TempRepository;
  let cwd: string;
  let slow: TempRepository;

  beforeAll(async () => {
    temp = await tempRepository(tempFolder('run'));
    gitPath = temp.gitPath;
    cwd = temp.root;
    await temp.commit('first', { 'a.txt': 'a\n' });
    slow = await filteredSlowly();
  });

  afterAll(() => {
    removeFolder(cwd);
    removeFolder(slow.root);
  });

  test('lets a checkout or fast-forward finish when asked to stop every git, as stopping one midway can leave the working tree half switched', async () => {
    const folder = tempFolder('quitting');
    const hooks = path.join(cwd, '.git', 'hooks');
    fs.mkdirSync(hooks, { recursive: true });
    const [main] = await temp.resolve('main');
    const ahead = (
      await temp.git('commit-tree', 'main^{tree}', '-p', 'main', '-m', 'ahead')
    ).trim();
    await temp.git('branch', 'finishing');
    const writes = {
      'post-checkout': () => switchToBranch(gitPath, cwd, 'finishing'),
      'post-merge': () => fastForward(gitPath, cwd, ahead),
    };
    const childProcess = process.getBuiltinModule('node:child_process');
    const { execFile } = childProcess;
    const stops: Promise<void>[] = [];
    replaceBuiltin(
      childProcess,
      'execFile',
      (
        file: string,
        args: readonly string[],
        options: object,
        callback: (...result: unknown[]) => void,
      ) => {
        const { promise, resolve } = Promise.withResolvers<void>();
        stops.push(promise);
        return execFile(file, args, options, (...result: unknown[]) => {
          resolve();
          callback(...result);
        });
      },
    );
    try {
      for (const [hook, write] of Object.entries(writes)) {
        const held = heldHook(folder, hook);
        fs.writeFileSync(path.join(hooks, hook), held.script, { mode: 0o755 });
        const writing = write();
        await waitFor(
          () => fs.existsSync(held.started),
          `the ${hook} to start`,
        );
        const { setTimeout } = globalThis;
        const delays: number[] = [];
        Reflect.set(globalThis, 'setTimeout', (run: () => void, ms: number) => {
          delays.push(ms);
          return setTimeout(run, ms);
        });
        let stopping: Promise<void>;
        try {
          stopping = stopRunningGit();
        } finally {
          Reflect.set(globalThis, 'setTimeout', setTimeout);
        }
        assert.ok(
          delays.some((ms) => ms > 29_000 && ms <= 30_000),
          `${hook}: ${delays.join(', ')}`,
        );
        await new Promise((resolve) => setImmediate(resolve));
        await Promise.all(stops);
        fs.writeFileSync(held.release, '');
        await stopping;
        assert.ok(fs.existsSync(held.done), hook);
        await writing;
      }
    } finally {
      replaceBuiltin(childProcess, 'execFile', execFile);
      for (const hook of Object.keys(writes)) {
        fs.writeFileSync(heldHook(folder, hook).release, '');
        fs.rmSync(path.join(hooks, hook), { force: true });
      }
      await temp.git('checkout', '-q', 'main');
      await temp.git('reset', '-q', '--hard', main);
      await temp.git('branch', '-D', 'finishing');
      removeFolder(folder);
    }
  });

  test('leaves the index unlocked when it stops a checkout or fast-forward that would not finish in time, as Windows stops git with no chance to remove its lock', async () => {
    await stuckWriting(
      slow,
      'checkout',
      (root) => switchToBranch(gitPath, root, 'slow'),
      stoppedAtOnce,
    );
    await stuckWriting(
      slow,
      'fast-forward',
      (root) => fastForward(gitPath, root, 'slow'),
      stoppedAtOnce,
    );
  });

  test('waits at most 30 seconds in all for a checkout or fast-forward, as stopping one midway can leave the working tree half switched', async () => {
    await stuckWriting(
      slow,
      'checkout',
      (root) => switchToBranch(gitPath, root, 'slow'),
      async (writing) => {
        const { setTimeout } = globalThis;
        const delays: number[] = [];
        Reflect.set(globalThis, 'setTimeout', (run: () => void, ms: number) => {
          delays.push(ms);
          return setTimeout(run, ms);
        });
        let ended: Promise<void>;
        try {
          ended = writesEnded();
        } finally {
          Reflect.set(globalThis, 'setTimeout', setTimeout);
        }
        assert.strictEqual(delays.length, 1);
        assert.ok(delays[0] > 29_000 && delays[0] <= 30_000, `${delays[0]}`);
        await stopRunningGit(0);
        await Promise.all([ended, writing]);
      },
    );
  });

  test('waits for a checkout or fast-forward running, leaving the other gits running, as an update waits for them before it restarts the app', async () => {
    const folder = tempFolder('installing');
    const reading = path.join(folder, 'reading').replaceAll('\\', '/');
    const held = heldHook(folder, 'post-checkout');
    const hooks = path.join(cwd, '.git', 'hooks');
    const hook = path.join(hooks, 'post-checkout');
    fs.mkdirSync(hooks, { recursive: true });
    fs.writeFileSync(hook, held.script, { mode: 0o755 });
    await temp.git('branch', 'finishing');
    try {
      let read = false;
      const stalled = runGit(gitPath, cwd, [
        '-c',
        `alias.stall=!echo > '${reading}'; sleep 15`,
        'stall',
      ]).finally(() => {
        read = true;
      });
      const stopped = assert.rejects(stalled);
      await waitFor(() => fs.existsSync(reading), 'git to start');
      const switching = switchToBranch(gitPath, cwd, 'finishing');
      await waitFor(() => fs.existsSync(held.started), 'the checkout to start');
      const ended = writesEnded();
      assert.strictEqual(await settledYet(ended), false);
      fs.writeFileSync(held.release, '');
      await ended;
      assert.ok(fs.existsSync(held.done));
      assert.strictEqual(read, false);
      await switching;
      await stopRunningGit();
      await stopped;
    } finally {
      fs.writeFileSync(held.release, '');
      fs.rmSync(hook);
      await temp.git('checkout', '-q', 'main');
      await temp.git('branch', '-D', 'finishing');
      removeFolder(folder);
    }
  });

  test('waits too for a checkout or fast-forward started while it waits, as an update would otherwise start its installer while one runs in another tab', async () => {
    const folder = tempFolder('installing-twice');
    const other = await tempRepository(tempFolder('installing-other'));
    await other.commit('first', { 'a.txt': 'a\n' });
    const first = heldHook(folder, 'first');
    const second = heldHook(folder, 'second');
    const hookIn = (root: string, held: typeof first) => {
      const hooks = path.join(root, '.git', 'hooks');
      fs.mkdirSync(hooks, { recursive: true });
      fs.writeFileSync(path.join(hooks, 'post-checkout'), held.script, {
        mode: 0o755,
      });
    };
    hookIn(cwd, first);
    hookIn(other.root, second);
    await temp.git('branch', 'finishing');
    await other.git('branch', 'finishing');
    try {
      const switching = switchToBranch(gitPath, cwd, 'finishing');
      await waitFor(() => fs.existsSync(first.started), 'the first to start');
      const ended = writesEnded();
      const switchingOther = switchToBranch(gitPath, other.root, 'finishing');
      await waitFor(() => fs.existsSync(second.started), 'the second to start');
      fs.writeFileSync(first.release, '');
      await switching;
      assert.strictEqual(await settledYet(ended), false);
      fs.writeFileSync(second.release, '');
      await ended;
      assert.ok(fs.existsSync(second.done));
      await switchingOther;
    } finally {
      fs.writeFileSync(first.release, '');
      fs.writeFileSync(second.release, '');
      fs.rmSync(path.join(cwd, '.git', 'hooks', 'post-checkout'));
      await temp.git('checkout', '-q', 'main');
      await temp.git('branch', '-D', 'finishing');
      removeFolder(other.root);
      removeFolder(folder);
    }
  });

  test('gives no new time to a checkout or fast-forward that outlived the wait before, as restarting into an update waits for them, then quits, which waits again', async () => {
    await stuckWriting(
      slow,
      'checkout',
      (root) => switchToBranch(gitPath, root, 'slow'),
      async (writing) => {
        await writesEnded(200);
        const stopping = performance.now();
        await stopRunningGit(3000);
        assert.ok(performance.now() - stopping < 2000);
        await writing;
      },
    );
  });

  test('waits for a checkout or fast-forward however long it takes once the app quits, past the time an update gives it, as stopping one midway can leave the working tree half switched', async () => {
    const folder = tempFolder('quitting-waits');
    const held = heldHook(folder, 'post-checkout');
    const hooks = path.join(cwd, '.git', 'hooks');
    const hook = path.join(hooks, 'post-checkout');
    fs.mkdirSync(hooks, { recursive: true });
    fs.writeFileSync(hook, held.script, { mode: 0o755 });
    await temp.git('branch', 'finishing');
    try {
      const switching = switchToBranch(gitPath, cwd, 'finishing');
      await waitFor(() => fs.existsSync(held.started), 'the checkout to start');
      await writesEnded(100);
      const ended = stopRunningGit(Infinity);
      await new Promise((resolve) => setTimeout(resolve, 300));
      assert.strictEqual(await settledYet(ended), false);
      assert.strictEqual(writesRunning(), true);
      fs.writeFileSync(held.release, '');
      await ended;
      assert.ok(fs.existsSync(held.done));
      assert.strictEqual(writesRunning(), false);
      await switching;
    } finally {
      fs.writeFileSync(held.release, '');
      fs.rmSync(hook);
      await temp.git('checkout', '-q', 'main');
      await temp.git('branch', '-D', 'finishing');
      removeFolder(folder);
    }
  });

  test('stops what git started too, even what outlived the process that started it', async (context) => {
    if (process.platform === 'win32') {
      context.skip();
    }
    const folder = tempFolder('outlived');
    const started = path.join(folder, 'started');
    const stopping = new AbortController();
    try {
      const stalled = runGit(
        gitPath,
        cwd,
        [
          '-c',
          `alias.stall=!(sleep 15 & echo $! > '${started}'); sleep 15`,
          'stall',
        ],
        { signal: stopping.signal },
      );
      await waitFor(
        () =>
          fs.existsSync(started) && /\d/.test(fs.readFileSync(started, 'utf8')),
        'git to start',
      );
      const outlived = Number(fs.readFileSync(started, 'utf8'));
      stopping.abort();
      await assert.rejects(stalled);
      await waitFor(() => !running(outlived), 'what git started to stop', 5000);
    } finally {
      removeFolder(folder);
    }
  });

  test('stops every git still running when asked, as the app does when it quits', async () => {
    const folder = tempFolder('quitting');
    const started = path.join(folder, 'started').replaceAll('\\', '/');
    try {
      const stalled = runGit(gitPath, cwd, [
        '-c',
        `alias.stall=!echo > '${started}'; sleep 15`,
        'stall',
      ]);
      await waitFor(() => fs.existsSync(started), 'git to start');
      const stopped = performance.now();
      const failed = assert.rejects(stalled);
      await stopRunningGit();
      await failed;
      assert.ok(performance.now() - stopped < 5000);
    } finally {
      removeFolder(folder);
    }
  });

  test('is done stopping every git only once a git it was already stopping is stopped, though that git has exited, as Windows may end it before what it started, and the app quit with its ssh still running', async (context) => {
    if (process.platform !== 'win32') {
      context.skip();
    }
    const childProcess = process.getBuiltinModule('node:child_process');
    const { execFile } = childProcess;
    const folder = tempFolder('stopping');
    const started = path.join(folder, 'started').replaceAll('\\', '/');
    const stopping = new AbortController();
    const done: string[] = [];
    let first = true;
    replaceBuiltin(
      childProcess,
      'execFile',
      (
        file: string,
        args: readonly string[],
        options: object,
        callback: () => void,
      ) => {
        if (!first || !file.endsWith('taskkill.exe')) {
          return execFile(file, args, options, callback);
        }
        first = false;
        return execFile(file, args, options, () => {
          setTimeout(() => {
            done.push('stopping git');
            callback();
          }, 100);
        });
      },
    );
    try {
      const stalled = runGit(
        gitPath,
        cwd,
        ['-c', `alias.stall=!echo > '${started}'; sleep 15`, 'stall'],
        { signal: stopping.signal },
      );
      await waitFor(() => fs.existsSync(started), 'git to start');
      stopping.abort();
      await assert.rejects(stalled);
      await stopRunningGit();
      done.push('stopping every git');
      assert.deepStrictEqual(done, ['stopping git', 'stopping every git']);
    } finally {
      replaceBuiltin(childProcess, 'execFile', execFile);
      removeFolder(folder);
    }
  });
});

function running(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { replaceBuiltin } from '../../../../helpers/builtins';
import { gitErrorText } from '../../../../../tools/git/main/errorText';
import { fastForward } from '../../../../../tools/git/main/branches';
import { switchToBranch } from '../../../../../tools/git/main/repository';
import {
  runGit,
  stopRunningGit,
  writesEnded,
} from '../../../../../tools/git/main/run';
import { waitFor } from '../../../../helpers/fixtures';
import {
  removeFolder,
  tempFolder,
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

  test("runs the real git behind Git for Windows' launcher, its shell seeing what the launcher would give it, for commands that run the user's hooks and credential helpers too", async (context) => {
    const bin = path.dirname(gitPath);
    const root =
      path.basename(bin).toLowerCase() === 'cmd'
        ? path.dirname(bin)
        : path.dirname(path.dirname(bin));
    const launcher = path.join(root, 'cmd', 'git.exe');
    if (process.platform !== 'win32' || !fs.existsSync(launcher)) {
      context.skip();
    }
    const childProcess = process.getBuiltinModule('node:child_process');
    const { spawn } = childProcess;
    const started: string[] = [];
    const seen = ['-c', 'alias.seen=!echo "$MSYSTEM $PATH"', 'seen'];
    replaceBuiltin(
      childProcess,
      'spawn',
      (...args: Parameters<typeof spawn>) => {
        const [command, gitArgs] = args;
        if (gitArgs.includes('seen')) {
          started.push(command);
        }
        return spawn(...args);
      },
    );
    let direct: string;
    let hooked: string;
    try {
      direct = await runGit(launcher, cwd, seen);
      hooked = await runGit(launcher, cwd, seen, { runsUserCode: true });
    } finally {
      replaceBuiltin(childProcess, 'spawn', spawn);
    }
    assert.strictEqual(direct, hooked);
    assert.strictEqual(started.length, 2);
    for (const command of started) {
      assert.match(command, /\\(ucrt64|mingw64|clangarm64)\\bin\\git\.exe$/i);
    }
  });

  test('runs its own commands in the C locale, so the messages it reads, such as a folder not being a repository, are in English, sparing git setting up translations each time it starts', async () => {
    const locale = await runGit(gitPath, cwd, [
      '-c',
      'alias.locale=!echo "[$LC_ALL]"',
      'locale',
    ]);
    assert.strictEqual(locale.trim(), '[C]');
  });

  test("asks every git to give no advice, its own commands and those running the user's code, as git words its hints in the user's language, where they can't be told from what git says", async () => {
    for (const runsUserCode of [false, true]) {
      const advice = await runGit(
        gitPath,
        cwd,
        ['-c', 'alias.advice=!echo "[$GIT_ADVICE]"', 'advice'],
        { runsUserCode },
      );
      assert.strictEqual(advice.trim(), '[0]', String(runsUserCode));
    }
  });

  test('says only what git said when it fails, keeping the command for the log', async () => {
    await assert.rejects(
      switchToBranch(gitPath, cwd, 'no-such-branch'),
      (error) => {
        assert.strictEqual(
          gitErrorText(error),
          'fatal: invalid reference: no-such-branch',
        );
        assert.match(String(error), /git switch .*no-such-branch failed/);
        return true;
      },
    );
  });

  test('leaves the user and password of a URL out of what it says when git fails, as git itself does, the log and the notices showing it', async () => {
    const url = 'https://x-token:ghp_secret@example.invalid/org/repo.git';
    for (const args of [
      ['rev-parse', url],
      ['config', '--get', `remote.${url}.url`],
    ]) {
      await assert.rejects(runGit(gitPath, cwd, args), (error) => {
        for (const said of [String(error), gitErrorText(error)]) {
          assert.doesNotMatch(said, /x-token|ghp_secret/, said);
        }
        assert.match(String(error), /https:\/\/example\.invalid\/org\/repo/);
        return true;
      });
    }
  });

  test('starts git again when Windows could not initialize its process, as it fails now and then on a loaded machine before git runs at all', async (context) => {
    if (process.platform !== 'win32') {
      context.skip();
    }
    const childProcess = process.getBuiltinModule('node:child_process');
    const { spawn } = childProcess;
    let started = 0;
    replaceBuiltin(
      childProcess,
      'spawn',
      (command: string, args: readonly string[], options: object) => {
        if (!args.includes('rev-parse')) {
          return spawn(command, args, options);
        }
        started += 1;
        return started < 3
          ? spawn(process.execPath, ['-e', 'process.exit(0xc0000142)'], options)
          : spawn(command, args, options);
      },
    );
    try {
      const head = await runGit(gitPath, cwd, ['rev-parse', 'HEAD']);
      assert.match(head.trim(), /^[0-9a-f]{40,64}$/);
      assert.strictEqual(started, 3);
    } finally {
      replaceBuiltin(childProcess, 'spawn', spawn);
    }
  });

  test('gives up starting git once Windows could not initialize its process three times', async (context) => {
    if (process.platform !== 'win32') {
      context.skip();
    }
    const childProcess = process.getBuiltinModule('node:child_process');
    const { spawn } = childProcess;
    let started = 0;
    replaceBuiltin(
      childProcess,
      'spawn',
      (command: string, args: readonly string[], options: object) => {
        if (!args.includes('rev-parse')) {
          return spawn(command, args, options);
        }
        started += 1;
        return spawn(
          process.execPath,
          ['-e', 'process.exit(0xc0000142)'],
          options,
        );
      },
    );
    try {
      await assert.rejects(
        runGit(gitPath, cwd, ['rev-parse', 'HEAD']),
        /git rev-parse HEAD failed: it exited with code 3221225794/,
      );
      assert.strictEqual(started, 3);
    } finally {
      replaceBuiltin(childProcess, 'spawn', spawn);
    }
  });

  test('says what git said when it exits before reading all its input', async () => {
    await assert.rejects(
      runGit(gitPath, cwd, ['rev-parse', '--verify', 'no-such-ref'], {
        input: 'x\n'.repeat(4 * 1024 * 1024),
      }),
      (error) => {
        assert.strictEqual(
          gitErrorText(error),
          'fatal: Needed a single revision',
        );
        return true;
      },
    );
  });
});

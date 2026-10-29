import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { replaceBuiltin } from '../../../../builtins';
import { gitErrorText } from '../../../../../tools/git/main/cli/errorText';
import { fastForward } from '../../../../../tools/git/main/cli/branches';
import {
  checkoutNewBranch,
  fetchAllRemotes,
  switchToBranch,
  switchToCommit,
} from '../../../../../tools/git/main/cli/repository';
import {
  runGit,
  runGitBytes,
  stopRunningGit,
  writesEnded,
} from '../../../../../tools/git/main/cli/run';
import { ignoredPaths } from '../../../../../tools/git/main/cli/watch';
import {
  workingTreeFiles,
  workingTreePatch,
} from '../../../../../tools/git/main/cli/workingTree';
import { waitFor } from '../../../../fixtures';
import {
  removeFolder,
  tempFolder,
  tempRepository,
  withEnv,
  type TempRepository,
} from '../../../../repositories';

async function printing300MB(run: () => Promise<unknown>): Promise<void> {
  const childProcess = process.getBuiltinModule('node:child_process');
  const { spawn } = childProcess;
  const printing = `
    process.stderr.write('warning: ignoring broken ref refs/heads/broken\\n');
    const chunk = 'x'.repeat(1 << 20);
    let left = 300;
    const write = () => {
      while (left-- > 0) {
        if (!process.stdout.write(chunk)) {
          process.stdout.once('drain', write);
          return;
        }
      }
      process.stdout.end();
    };
    write();
  `;
  replaceBuiltin(
    childProcess,
    'spawn',
    (command: string, args: readonly string[], options: object) =>
      args.includes('printing')
        ? spawn(process.execPath, ['-e', printing], options)
        : spawn(command, args, options),
  );
  try {
    await assert.rejects(run(), (error) => {
      assert.match(
        gitErrorText(error),
        /^git printing failed: it printed over 256 MB$/m,
      );
      assert.match(gitErrorText(error), /ignoring broken ref/);
      return true;
    });
  } finally {
    replaceBuiltin(childProcess, 'spawn', spawn);
  }
}

function heldHook(folder: string, name: string) {
  const mark = (what: string) =>
    path.join(folder, `${name}-${what}`).replaceAll('\\', '/');
  const [started, release, done] = ['started', 'release', 'done'].map(mark);
  return {
    started,
    release,
    done,
    script: `#!/bin/sh\necho > '${started}'\nwhile [ ! -e '${release}' ]; do sleep 0.05; done\necho > '${done}'\n`,
  };
}

async function settledYet(promise: Promise<unknown>): Promise<boolean> {
  let settled = false;
  const settle = () => {
    settled = true;
  };
  promise.then(settle, settle);
  await new Promise((resolve) => setImmediate(resolve));
  return settled;
}

async function stoppedAtOnce(writing: Promise<void>): Promise<void> {
  await stopRunningGit(0);
  await writing;
}

async function filteredSlowly(): Promise<TempRepository> {
  const slow = await tempRepository(tempFolder('slow'));
  await slow.commit('first', {
    '.gitattributes': '*.txt filter=slow\n',
    'a.txt': 'a\n',
  });
  await slow.git('switch', '-q', '-c', 'slow');
  await slow.commit('slow', { 'a.txt': 'b\n' });
  await slow.git('switch', '-q', 'main');
  return slow;
}

async function stuckWriting(
  slow: TempRepository,
  name: string,
  write: (root: string) => Promise<unknown>,
  stuckWhile: (writing: Promise<void>) => Promise<void>,
): Promise<void> {
  const folder = tempFolder(`${name}-marks`);
  const started = path.join(folder, 'started').replaceAll('\\', '/');
  const stuck = await slow.copy(tempFolder(name));
  try {
    await stuck.git(
      'config',
      'filter.slow.smudge',
      `echo > '${started}'; sleep 15; cat`,
    );
    const writing = assert.rejects(write(stuck.root));
    await waitFor(() => fs.existsSync(started), `the ${name} to start`);
    await stuckWhile(writing);
    assert.strictEqual(
      fs.existsSync(path.join(stuck.root, '.git', 'index.lock')),
      false,
      name,
    );
  } finally {
    removeFolder(stuck.root);
    removeFolder(folder);
  }
}

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

  test('says git printed over 256 MB, bounding the memory its output takes, though it warned of something first, as the warning would hide why it was stopped', async () => {
    await printing300MB(() => runGit(gitPath, cwd, ['printing']));
  });

  test('stops git past 256 MB even when its output is taken as git sends it, as the commit list is', async () => {
    let taken = 0;
    await printing300MB(() =>
      runGitBytes(gitPath, cwd, ['printing'], {
        onOutput: (chunk) => {
          taken += chunk.length;
        },
      }),
    );
    assert.ok(taken <= 256 * 1024 * 1024, `${taken}`);
    assert.ok(taken > 255 * 1024 * 1024, `${taken}`);
  });

  test('reads and switches the repository it was given, though the environment names another', async () => {
    const other = await tempRepository(tempFolder('other'));
    try {
      await other.commit('other');
      await temp.git('branch', 'elsewhere');
      await withEnv(
        {
          GIT_DIR: path.join(other.root, '.git'),
          GIT_WORK_TREE: other.root,
        },
        async () => {
          assert.deepStrictEqual(
            (await runGit(gitPath, cwd, ['log', '-1', '--format=%s'])).trim(),
            'first',
          );
          await switchToBranch(gitPath, cwd, 'elsewhere');
        },
      );
      assert.strictEqual(
        (await temp.git('branch', '--show-current')).trim(),
        'elsewhere',
      );
    } finally {
      await temp.git('switch', '-q', 'main');
      await temp.git('branch', '-D', 'elsewhere');
      removeFolder(other.root);
    }
  });

  test('reads the status and the changes without rewriting the index, even for a file touched since it was staged', async () => {
    const later = new Date(Date.now() + 60_000);
    fs.utimesSync(path.join(cwd, 'a.txt'), later, later);
    const index = path.join(cwd, '.git', 'index');
    const before = fs.readFileSync(index);
    const run = (...args: string[]) => runGit(gitPath, cwd, args);
    assert.strictEqual(await run('status', '--porcelain'), '');
    assert.strictEqual(await run('diff'), '');
    assert.deepStrictEqual(fs.readFileSync(index), before);
  });

  test("runs the hooks and ssh of every command that has them without the settings it reads git's output with, as the user's own git would run them", async () => {
    const folder = tempFolder('hooked');
    const seen = path.join(folder, 'seen.txt').replaceAll('\\', '/');
    const record = `echo "[$GIT_LITERAL_PATHSPECS][$GIT_OPTIONAL_LOCKS][$LC_ALL][$GIT_CONFIG_PARAMETERS]" > '${seen}'`;
    const hooks = path.join(cwd, '.git', 'hooks');
    const [first] = await temp.resolve('HEAD');
    await temp.git('switch', '-q', '-c', 'ahead');
    await temp.commit('ahead');
    await temp.git('switch', '-q', 'main');
    await temp.git('branch', 'hooked');
    await temp.git('remote', 'add', 'hooked', 'ssh://hooked.invalid/x');
    await temp.git('config', 'core.sshCommand', `${record}; false`);
    fs.mkdirSync(hooks, { recursive: true });
    for (const hook of ['post-checkout', 'post-merge']) {
      fs.writeFileSync(path.join(hooks, hook), `#!/bin/sh\n${record}\n`, {
        mode: 0o755,
      });
    }
    const commands = {
      switchToBranch: () => switchToBranch(gitPath, cwd, 'hooked'),
      fastForward: () => fastForward(gitPath, cwd, 'ahead'),
      switchToCommit: () => switchToCommit(gitPath, cwd, first),
      checkoutNewBranch: () =>
        checkoutNewBranch(gitPath, cwd, 'tracking', 'main'),
      fetchAllRemotes: () => assert.rejects(fetchAllRemotes(gitPath, cwd)),
    };
    try {
      await withEnv({ LC_ALL: 'en_US.UTF-8' }, async () => {
        for (const [name, run] of Object.entries(commands)) {
          fs.rmSync(seen, { force: true });
          await run();
          const [, literal, locks, locale, config = ''] =
            /^\[(.*)\]\[(.*)\]\[(.*)\]\[(.*)\]$/.exec(
              fs.readFileSync(seen, 'utf8').trim(),
            ) ?? [];
          assert.deepStrictEqual(
            [literal, locks, locale],
            ['', '', 'en_US.UTF-8'],
            name,
          );
          assert.doesNotMatch(config, /autoRefreshIndex|quotePath/, name);
        }
      });
    } finally {
      for (const hook of ['post-checkout', 'post-merge']) {
        fs.rmSync(path.join(hooks, hook));
      }
      await temp.git('config', '--unset', 'core.sshCommand');
      await temp.git('remote', 'remove', 'hooked');
      await temp.git('checkout', '-q', 'main');
      for (const branch of ['hooked', 'ahead', 'tracking']) {
        await temp.git('update-ref', '-d', `refs/heads/${branch}`);
      }
      removeFolder(folder);
    }
  });

  test('gives up on a stopped git even while what it started outlives it holding its output, as a stalled ssh would', async () => {
    const folder = tempFolder('outlived');
    const started = path.join(folder, 'started').replaceAll('\\', '/');
    const escaped = path.join(folder, 'escaped').replaceAll('\\', '/');
    const stopping = new AbortController();
    try {
      const stalled = runGit(
        gitPath,
        cwd,
        [
          '-c',
          `alias.stall=!((trap '' TERM; exec sleep 15) & echo $! > '${escaped}'); echo > '${started}'; sleep 15`,
          'stall',
        ],
        { signal: stopping.signal },
      );
      await waitFor(() => fs.existsSync(started), 'git to start');
      const stopped = performance.now();
      stopping.abort();
      await assert.rejects(stalled);
      assert.ok(performance.now() - stopped < 5000);
    } finally {
      if (process.platform !== 'win32' && fs.existsSync(escaped)) {
        process.kill(Number(fs.readFileSync(escaped, 'utf8')), 'SIGKILL');
      }
      removeFolder(folder);
    }
  });

  test("is done once git exits, though what a hook left running holds its output, as the user's own git would be", async () => {
    const folder = tempFolder('outlived');
    const escaped = path.join(folder, 'escaped').replaceAll('\\', '/');
    try {
      const started = performance.now();
      assert.strictEqual(
        await runGit(gitPath, cwd, [
          '-c',
          `alias.leave=!(sleep 10 & echo $! > '${escaped}'); echo done`,
          'leave',
        ]),
        'done\n',
      );
      assert.ok(performance.now() - started < 5000);
    } finally {
      if (process.platform !== 'win32' && fs.existsSync(escaped)) {
        process.kill(Number(fs.readFileSync(escaped, 'utf8')), 'SIGKILL');
      }
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

function running(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

suite('A file system monitor the repository sets', () => {
  test('is never run when it is a command, which git would run on every read of the index', async () => {
    const folder = tempFolder('monitored');
    try {
      const repository = await tempRepository(path.join(folder, 'repository'));
      const { gitPath, root } = repository;
      await repository.commit('first', { 'a.txt': 'one\n' });
      fs.writeFileSync(path.join(root, 'a.txt'), 'two\n');
      fs.writeFileSync(path.join(root, 'b.txt'), 'new\n');
      const ran = path.join(folder, 'ran.txt').replaceAll('\\', '/');
      await repository.git('config', 'core.fsmonitor', `echo >> '${ran}'`);
      const workingTree = await workingTreeFiles(gitPath, root);
      await workingTreePatch(gitPath, root, workingTree);
      await ignoredPaths(gitPath, root, [path.join(root, 'b.txt')]);
      assert.strictEqual(fs.existsSync(ran), false);
      assert.deepStrictEqual(
        workingTree.files.map((file) => file.path),
        ['a.txt', 'b.txt'],
      );
    } finally {
      removeFolder(folder);
    }
  });

  test("is kept on when it is git's own", async () => {
    const repository = await tempRepository(tempFolder('daemon'));
    try {
      await repository.git('config', 'core.fsmonitor', 'true');
      const monitor = await runGit(repository.gitPath, repository.root, [
        'config',
        'core.fsmonitor',
      ]);
      assert.strictEqual(monitor.trim(), 'true');
    } finally {
      removeFolder(repository.root);
    }
  });

  test("reads whether git's own monitor is on only the first time it runs git in a folder, as reading it takes a git of its own", async () => {
    const repository = await tempRepository(tempFolder('daemon-later'));
    try {
      const run = (...args: string[]) =>
        runGit(repository.gitPath, repository.root, args);
      await run('status');
      await repository.git('config', 'core.fsmonitor', 'true');
      assert.strictEqual(
        (await run('config', 'core.fsmonitor')).trim(),
        'false',
      );
    } finally {
      removeFolder(repository.root);
    }
  });
});

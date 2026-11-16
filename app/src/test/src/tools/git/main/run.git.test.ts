import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { replaceBuiltin } from '../../../../helpers/builtins';
import { gitErrorText } from '../../../../../lib/main/errorText';
import { fastForward } from '../../../../../tools/git/main/branches';
import {
  checkoutNewBranch,
  switchToBranch,
  switchToCommit,
} from '../../../../../tools/git/main/switches';
import { fetchAllRemotes } from '../../../../../tools/git/main/transfers';
import { runGit, runGitBytes } from '../../../../../tools/git/main/run';
import { waitFor } from '../../../../helpers/fixtures';
import {
  tempRepository,
  type TempRepository,
} from '../../../../helpers/repositories';
import { filteredSlowly } from './runFixtures';
import { removeFolder, tempFolder } from '../../../../helpers/tempFolders';
import { withEnv } from '../../../../helpers/env';

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

  test('takes no bare repository it was not named, as a folder inside a cloned repository can be one whose config makes git run its commands', async () => {
    const folder = tempFolder('bare');
    try {
      const { execFileSync } = process.getBuiltinModule('node:child_process');
      const marker = path.join(folder, 'ran').replaceAll('\\', '/');
      const bare = path.join(folder, 'evil');
      const inBare = (...args: string[]) =>
        execFileSync(gitPath, ['-C', bare, ...args], { stdio: 'pipe' });
      execFileSync(gitPath, ['init', '-q', '--bare', bare]);
      inBare('config', 'core.bare', 'false');
      inBare('config', 'core.worktree', '..');
      inBare('config', 'filter.run.clean', `echo ran > "${marker}"; cat`);
      fs.mkdirSync(path.join(bare, 'info'), { recursive: true });
      fs.writeFileSync(path.join(bare, 'info', 'attributes'), '* filter=run\n');
      fs.writeFileSync(path.join(folder, 'a.txt'), 'a\n');
      execFileSync(
        gitPath,
        [
          '--git-dir',
          bare,
          '--work-tree',
          folder,
          '-c',
          'filter.run.clean=cat',
          'add',
          'a.txt',
        ],
        { cwd: folder, stdio: 'pipe' },
      );
      fs.appendFileSync(path.join(folder, 'a.txt'), 'b\n');
      inBare('diff');
      assert.ok(fs.existsSync(marker), 'git runs the filter of the folder');
      fs.rmSync(marker);
      await assert.rejects(runGit(gitPath, bare, ['diff']));
      await assert.rejects(
        runGit(gitPath, bare, ['fetch', '--all'], { runsUserCode: true }),
      );
      assert.ok(!fs.existsSync(marker));
    } finally {
      removeFolder(folder);
    }
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

import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { gitErrorText } from '../../git/errorText';
import { switchToBranch } from '../../git/repository';
import { runGit, stopRunningGit } from '../../git/run';
import { ignoredPaths } from '../../git/watch';
import { workingTreeFiles, workingTreePatch } from '../../git/workingTree';
import { waitFor } from '../fixtures';
import {
  removeFolder,
  tempFolder,
  tempRepository,
  type TempRepository,
} from '../repositories';

suite('Running git in a repository', function () {
  this.timeout(20_000);
  let gitPath: string;
  let temp: TempRepository;
  let cwd: string;

  suiteSetup(async () => {
    temp = await tempRepository(tempFolder('run'));
    gitPath = temp.gitPath;
    cwd = temp.root;
    await temp.commit('first', { 'a.txt': 'a\n' });
  });

  suiteTeardown(() => removeFolder(cwd));

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

  test("runs hooks without the settings it reads git's output with, as the user's own git would run them", async () => {
    const folder = tempFolder('hooked');
    const seen = path.join(folder, 'seen.txt').replaceAll('\\', '/');
    const hooks = path.join(cwd, '.git', 'hooks');
    fs.mkdirSync(hooks, { recursive: true });
    fs.writeFileSync(
      path.join(hooks, 'post-checkout'),
      `#!/bin/sh\necho "[$GIT_LITERAL_PATHSPECS][$GIT_OPTIONAL_LOCKS][$LC_ALL][$GIT_CONFIG_PARAMETERS]" > '${seen}'\n`,
      { mode: 0o755 },
    );
    await temp.git('branch', 'hooked');
    try {
      await switchToBranch(gitPath, cwd, 'hooked');
      const [, literal, locks, locale, config = ''] =
        /^\[(.*)\]\[(.*)\]\[(.*)\]\[(.*)\]$/.exec(
          fs.readFileSync(seen, 'utf8').trim(),
        ) ?? [];
      assert.strictEqual(literal, '');
      assert.strictEqual(locks, '');
      assert.strictEqual(locale, process.env.LC_ALL ?? '');
      assert.doesNotMatch(config, /autoRefreshIndex|quotePath/);
    } finally {
      fs.rmSync(path.join(hooks, 'post-checkout'));
      await temp.git('checkout', '-q', 'main');
      await temp.git('branch', '-D', 'hooked');
      removeFolder(folder);
    }
  });

  test('gives up on a stopped git even while what it started outlives it holding its output, as a stalled ssh would', async () => {
    const folder = tempFolder('outlived');
    const started = path.join(folder, 'started').replaceAll('\\', '/');
    const stopping = new AbortController();
    try {
      const stalled = runGit(
        gitPath,
        cwd,
        [
          '-c',
          `alias.stall=!(sleep 15 &); echo > '${started}'; sleep 15`,
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
      removeFolder(folder);
    }
  });

  test('stops what git started too, even what outlived the process that started it', async function () {
    if (process.platform === 'win32') {
      this.skip();
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

  test('runs its own commands in the C locale, sparing git setting up translations each time it starts', async () => {
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

suite('A file system monitor the repository sets', function () {
  this.timeout(20_000);

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
});

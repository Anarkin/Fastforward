import * as assert from 'node:assert';
import * as path from 'node:path';
import { PassThrough } from 'node:stream';
import { suite, test } from 'vitest';
import { waitFor } from '../../../../fixtures';
import { GitOutput, KeptGits } from '../../../../../tools/git/main/cli/keptGit';
import { startGit } from '../../../../../tools/git/main/cli/run';
import type { GitChild } from '../../../../../tools/git/main/cli/spawnedGit';
import { installedGit } from '../../../../repositories';

const catFile = [
  'cat-file',
  '--batch-command=%(objectname) %(objecttype) %(objectsize) %(objectmode)',
  '-Z',
];

const cwd = process.cwd();

async function headerOf(kept: KeptGits, gitPath: string): Promise<string> {
  const git = await kept.use(gitPath, cwd, catFile);
  assert.ok(git);
  return git.request('info HEAD\0', async (output) =>
    (await output.until(0)).toString('utf8'),
  );
}

function counting(started: GitChild[]) {
  return async (gitPath: string, at: string, args: readonly string[]) => {
    const child = await startGit(gitPath, at, args);
    started.push(child);
    return child;
  };
}

suite('A git kept running', () => {
  test('reads what git prints up to a byte or by its count, however it is cut into chunks', async () => {
    const stream = new PassThrough();
    const output = new GitOutput(stream);
    stream.write('one\0tw');
    stream.write('o\0abc');
    stream.write('def');

    assert.strictEqual((await output.until(0)).toString(), 'one');
    assert.strictEqual((await output.until(0)).toString(), 'two');
    assert.strictEqual((await output.take(5)).toString(), 'abcde');
    stream.end();
    assert.strictEqual((await output.take(1)).toString(), 'f');
    await assert.rejects(output.take(1));
  });

  test('answers every request through the one git it keeps running for a repository and command', async () => {
    const gitPath = await installedGit();
    const started: GitChild[] = [];
    const kept = new KeptGits(counting(started));
    try {
      const first = await headerOf(kept, gitPath);
      const second = await headerOf(kept, gitPath);

      assert.match(first, /^[0-9a-f]{40} commit \d+ $/);
      assert.strictEqual(second, first);
      assert.strictEqual(started.length, 1);
    } finally {
      kept.stopAll();
    }
  });

  test('starts git again once the one it kept stopped, as git may be stopped or crash', async () => {
    const gitPath = await installedGit();
    const started: GitChild[] = [];
    const kept = new KeptGits(counting(started));
    try {
      await headerOf(kept, gitPath);
      (await kept.use(gitPath, cwd, catFile))?.stop();
      await waitFor(() => started[0]?.exitCode !== null, 'git to stop');

      assert.match(await headerOf(kept, gitPath), / commit /);
      assert.strictEqual(started.length, 2);
    } finally {
      kept.stopAll();
    }
  });

  test('stops a git it kept once it is idle for a while, as an idle git holds the pack files open, which Windows then cannot delete', async () => {
    const gitPath = await installedGit();
    const started: GitChild[] = [];
    const kept = new KeptGits(counting(started), () => true, 100);
    await headerOf(kept, gitPath);

    await waitFor(() => started[0]?.exitCode !== null, 'the idle git to stop');
    assert.strictEqual(kept.count, 0);
  });

  test('keeps at most a few gits running in all, stopping the one used longest ago', async () => {
    const gitPath = await installedGit();
    const started: GitChild[] = [];
    const kept = new KeptGits(counting(started), () => true, 60_000, 2);
    try {
      for (const args of [
        catFile,
        [...catFile, '--follow-symlinks'],
        [...catFile, '--textconv'],
      ]) {
        await kept.use(gitPath, cwd, args);
      }

      await waitFor(
        () => started[0]?.exitCode !== null,
        'the oldest git to stop',
      );
      assert.strictEqual(kept.count, 2);
      assert.strictEqual(started[2]?.exitCode, null);
    } finally {
      kept.stopAll();
    }
  });

  test('keeps no git running while turned off, stopping those it kept, so every request starts git as before', async () => {
    const gitPath = await installedGit();
    const started: GitChild[] = [];
    let on = true;
    const kept = new KeptGits(counting(started), () => on);
    await headerOf(kept, gitPath);

    on = false;
    assert.strictEqual(await kept.use(gitPath, cwd, catFile), undefined);
    await waitFor(() => started[0]?.exitCode !== null, 'the kept git to stop');
    assert.strictEqual(kept.count, 0);
  });

  test('gives up on a request git does not answer in time, stopping that git so the next request starts a new one', async () => {
    const gitPath = await installedGit();
    const started: GitChild[] = [];
    const kept = new KeptGits(counting(started));
    try {
      const git = await kept.use(gitPath, cwd, catFile);
      assert.ok(git);

      await assert.rejects(
        git.request('info HEAD\0', (output) => output.take(1_000_000), 300),
      );
      assert.strictEqual(git.running, false);
      assert.match(await headerOf(kept, gitPath), / commit /);
      assert.strictEqual(started.length, 2);
    } finally {
      kept.stopAll();
    }
  });

  test('stops the gits it kept for a folder when asked, as on closing its tab, so the folder can be moved or deleted at once', async () => {
    const gitPath = await installedGit();
    const started: GitChild[] = [];
    const kept = new KeptGits(counting(started));
    const other = path.dirname(cwd);
    try {
      await kept.use(gitPath, cwd, catFile);
      await kept.use(gitPath, other, catFile);

      kept.stopIn(cwd);

      await waitFor(
        () => started[0]?.exitCode !== null,
        'the git of the folder to stop',
      );
      assert.strictEqual(started[1]?.exitCode, null);
      assert.strictEqual(kept.count, 1);
    } finally {
      kept.stopAll();
    }
  });

  test('keeps a git running while it answers, however long, counting it idle only from its last answer, as stopping it midway failed the request', async () => {
    const gitPath = await installedGit();
    const started: GitChild[] = [];
    const kept = new KeptGits(counting(started), () => true, 100);
    try {
      const git = await kept.use(gitPath, cwd, catFile);
      assert.ok(git);

      const header = await git.request('info HEAD\0', async (output) => {
        await new Promise((resolve) => setTimeout(resolve, 400));
        return (await output.until(0)).toString('utf8');
      });

      assert.match(header, / commit /);
      await waitFor(
        () => started[0]?.exitCode !== null,
        'the git to stop once idle',
      );
    } finally {
      kept.stopAll();
    }
  });
});

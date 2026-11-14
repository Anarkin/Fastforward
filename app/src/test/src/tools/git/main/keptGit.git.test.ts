import * as assert from 'node:assert';
import * as path from 'node:path';
import { PassThrough } from 'node:stream';
import { suite, test } from 'vitest';
import { waitFor } from '../../../../helpers/fixtures';
import {
  GitOutput,
  KeptGits,
  StoppedReading,
} from '../../../../../tools/git/main/keptGit';
import { startGit } from '../../../../../tools/git/main/run';
import type { GitChild } from '../../../../../tools/git/main/spawnedGit';
import { installedGit } from '../../../../helpers/repositories';

const catFile = [
  'cat-file',
  '--batch-command=%(objectname) %(objecttype) %(objectsize) %(objectmode)',
  '-Z',
];

const cwd = process.cwd();

const ended = (child: GitChild | undefined) =>
  child !== undefined && (child.exitCode !== null || child.signalCode !== null);

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

  test('hands on what git prints before a marker in parts, though the marker is cut across chunks, and stops reading when told to', async () => {
    const stream = new PassThrough();
    const output = new GitOutput(stream);
    const parts: string[] = [];
    stream.write('first part, ');
    stream.write('second part\n#MA');
    stream.write('RK#rest');

    assert.strictEqual((await output.peek(5)).toString(), 'first');
    await output.streamUntil(Buffer.from('\n#MARK#'), (part) => {
      parts.push(part.toString());
      return false;
    });
    assert.strictEqual(parts.join(''), 'first part, second part');
    assert.strictEqual((await output.take(4)).toString(), 'rest');

    stream.write('too much');
    await assert.rejects(
      output.streamUntil(Buffer.from('#END#'), () => true),
      StoppedReading,
    );
  });

  test('answers every request through the one git it keeps running for a repository and command, as starting git costs a fraction of a second on Windows', async () => {
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
      await waitFor(() => ended(started[0]), 'git to stop');

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

    await waitFor(() => ended(started[0]), 'the idle git to stop');
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

      await waitFor(() => ended(started[0]), 'the oldest git to stop');
      assert.strictEqual(kept.count, 2);
      assert.strictEqual(ended(started[2]), false);
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
    await waitFor(() => ended(started[0]), 'the kept git to stop');
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
        git.request('info HEAD\0', (output) => output.take(1_000_000), {
          timeout: 300,
        }),
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

      await waitFor(() => ended(started[0]), 'the git of the folder to stop');
      assert.strictEqual(ended(started[1]), false);
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
      await waitFor(() => ended(started[0]), 'the git to stop once idle');
    } finally {
      kept.stopAll();
    }
  });

  test('starts one git for requests that come at once, as selecting a commit asks for its files and its patch together, rather than a second one it then loses track of and never stops', async () => {
    const gitPath = await installedGit();
    const started: GitChild[] = [];
    const kept = new KeptGits(counting(started));
    const [first, second] = await Promise.all([
      kept.use(gitPath, cwd, catFile),
      kept.use(gitPath, cwd, catFile),
    ]);

    assert.ok(first);
    assert.strictEqual(second, first);
    assert.strictEqual(started.length, 1);
    kept.stopAll();
    await waitFor(() => started.every(ended), 'every git started to stop');
  });

  test('stops the git answering a request no longer wanted, as what it prints next would be read for the request after, and leaves a request not yet sent unsent', async () => {
    const gitPath = await installedGit();
    const started: GitChild[] = [];
    const kept = new KeptGits(counting(started));
    try {
      const git = await kept.use(gitPath, cwd, catFile);
      assert.ok(git);
      const answering = new AbortController();
      const reached = Promise.withResolvers<void>();
      const reading = git.request(
        'info HEAD\0',
        (output) => {
          reached.resolve();
          return output.take(1_000_000);
        },
        { signal: answering.signal },
      );
      const waiting = new AbortController();
      const queued = git.request('info HEAD\0', (output) => output.until(0), {
        signal: waiting.signal,
      });
      await reached.promise;
      waiting.abort(new Error('not wanted'));
      answering.abort(new Error('moved on'));

      await assert.rejects(reading, { message: 'moved on' });
      await assert.rejects(queued, { message: 'not wanted' });
      assert.strictEqual(git.running, false);
      await assert.rejects(
        git.request('info HEAD\0', (output) => output.until(0), {
          signal: AbortSignal.abort(new Error('gone already')),
        }),
        { message: 'gone already' },
      );
    } finally {
      kept.stopAll();
    }
  });

  test('stops the gits it kept as soon as it is turned off, as settings apply as saved, rather than at the next request', async () => {
    const gitPath = await installedGit();
    const started: GitChild[] = [];
    let on = true;
    const kept = new KeptGits(counting(started), () => on);
    await headerOf(kept, gitPath);

    on = false;
    kept.update();

    await waitFor(() => ended(started[0]), 'the kept git to stop');
    assert.strictEqual(kept.count, 0);
  });

  test('stops the idle git used longest ago when too many are kept, rather than one still answering, whose request would fail and be read again', async () => {
    const gitPath = await installedGit();
    const started: GitChild[] = [];
    const kept = new KeptGits(counting(started), () => true, 60_000, 2);
    try {
      const busy = await kept.use(gitPath, cwd, catFile);
      assert.ok(busy);
      const answer = Promise.withResolvers<void>();
      const answering = busy.request('info HEAD\0', async (output) => {
        await answer.promise;
        return output.until(0);
      });
      await kept.use(gitPath, cwd, [...catFile, '--follow-symlinks']);
      await kept.use(gitPath, cwd, [...catFile, '--textconv']);

      await waitFor(() => ended(started[1]), 'the idle git to stop');
      assert.strictEqual(busy.running, true);
      answer.resolve();
      assert.match((await answering).toString('utf8'), / commit /);
    } finally {
      kept.stopAll();
    }
  });
});

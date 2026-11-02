import * as assert from 'node:assert';
import * as path from 'node:path';
import { build } from 'esbuild';
import { suite, test } from 'vitest';
import {
  gitStarter,
  threadFor,
  type GitChild,
} from '../../../../../tools/git/main/cli/spawnedGit';
import { removeFolder, tempFolder } from '../../../../repositories';

async function ran(
  child: GitChild,
  input?: string,
): Promise<{ readonly output: string; readonly code: number | null }> {
  const chunks: Buffer[] = [];
  child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
  child.stdin.end(input);
  const code = await new Promise<number | null>((resolve) =>
    child.on('close', resolve),
  );
  return { output: Buffer.concat(chunks).toString('utf8'), code };
}

const options = {
  cwd: process.cwd(),
  env: process.env,
  detached: false,
};

suite('Starting git', () => {
  test('relays what git prints, its exit code and the input it is given, as git started directly would', async () => {
    const starter = gitStarter(tempFolder('no-starter'));

    const hashed = await ran(
      starter.spawn('git', ['hash-object', '--stdin'], options),
      'hello\n',
    );
    const failed = await ran(
      starter.spawn('git', ['rev-parse', '--verify', 'no-such-ref'], options),
    );

    assert.deepStrictEqual(hashed, {
      output: 'ce013625030ba8dba906f756967f9e9ca394464a\n',
      code: 0,
    });
    assert.strictEqual(failed.code, 128);
  });

  test('says git could not be started, as for a command not found', async () => {
    const child = gitStarter(tempFolder('no-starter')).spawn(
      'no-such-git-command',
      [],
      options,
    );
    child.stdin.end();

    const error = await new Promise<NodeJS.ErrnoException>((resolve) =>
      child.on('error', resolve),
    );

    assert.strictEqual(error.code, 'ENOENT');
  });

  test('starts each git on a thread starting no other, adding threads up to the most it may have, then on the one starting fewest, as one start held up for seconds held up every start behind it', () => {
    assert.strictEqual(threadFor([], 4), 0);
    assert.strictEqual(threadFor([0], 4), 0);
    assert.strictEqual(threadFor([1], 4), 1);
    assert.strictEqual(threadFor([1, 0, 2], 4), 1);
    assert.strictEqual(threadFor([2, 1, 3, 1], 4), 1);
    assert.strictEqual(threadFor([1], 1), 0);
  });

  test('starts git in a worker thread once its starter is built next to it, as Windows can hold the thread starting a process for hundreds of milliseconds, which held up every message of the app', async () => {
    const folder = tempFolder('starter');
    try {
      await build({
        entryPoints: {
          gitSpawner: path.join(
            __dirname,
            '../../../../../tools/git/main/cli/gitSpawnerWorker.ts',
          ),
        },
        bundle: true,
        platform: 'node',
        format: 'cjs',
        outdir: folder,
        logLevel: 'silent',
      });
      const starter = gitStarter(folder);

      const version = await ran(starter.spawn('git', ['--version'], options));

      assert.strictEqual(starter.threaded, true);
      assert.match(version.output, /^git version /);
      assert.strictEqual(gitStarter(tempFolder('no-starter')).threaded, false);
    } finally {
      removeFolder(folder);
    }
  });
});

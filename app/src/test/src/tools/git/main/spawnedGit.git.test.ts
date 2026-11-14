import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { build } from 'esbuild';
import { suite, test } from 'vitest';
import {
  gitStarter,
  type GitChild,
} from '../../../../../tools/git/main/spawnedGit';
import { removeFolder, tempFolder } from '../../../../helpers/repositories';

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

suite('Starting the installed git', () => {
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

  test('hands git its input as it is written, before the input ends, so a git kept running answers each request as it comes', async () => {
    const child = gitStarter(tempFolder('no-starter')).spawn(
      'git',
      ['hash-object', '--stdin-paths'],
      { ...options, env: { ...process.env, GIT_FLUSH: '1' } },
    );
    const answered = new Promise<string>((resolve) =>
      child.stdout.once('data', (chunk: Buffer) =>
        resolve(chunk.toString('utf8')),
      ),
    );
    const file = path.join(tempFolder('streamed'), 'hello.txt');
    fs.writeFileSync(file, 'hello\n');

    child.stdin.write(`${file}\n`);
    const first = await answered;
    child.stdin.end();
    const code = await new Promise<number | null>((resolve) =>
      child.on('close', resolve),
    );

    assert.strictEqual(first, 'ce013625030ba8dba906f756967f9e9ca394464a\n');
    assert.strictEqual(code, 0);
  });

  test('settles a stop asked for once git has closed but before it tells of closing, as that stop waited for ever, and quitting with it', async () => {
    const starter = gitStarter(tempFolder('no-starter'));
    const child = starter.spawn('git', ['--version'], options);
    const stopped = new Promise<string>((resolve) => {
      child.stdout.on('end', () => {
        void child.stop().then(() => resolve('stopped'));
      });
    });
    child.stdout.resume();
    child.stdin.end();
    const late = new Promise<string>((resolve) => {
      setTimeout(() => resolve('late'), 2000);
    });
    assert.strictEqual(await Promise.race([stopped, late]), 'stopped');
  });

  test('starts git in a worker thread once its starter is built next to it, as Windows can hold the thread starting a process for hundreds of milliseconds, which held up every message of the app', async () => {
    const folder = tempFolder('starter');
    try {
      await build({
        entryPoints: {
          gitSpawner: path.join(
            __dirname,
            '../../../../../tools/git/main/gitSpawnerWorker.ts',
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

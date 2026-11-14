import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { build } from 'esbuild';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { hashOf } from '../../../../../tools/commander/main/contentHash';
import { hashWorkers } from '../../../../../tools/commander/main/hashWorkers';
import { removeFolder, tempFolder } from '../../../../helpers/repositories';

let built = '';
let files = '';
const at = (name: string) => path.join(files, name);

beforeAll(async () => {
  built = tempFolder('hash-worker');
  await build({
    entryPoints: {
      hashWorker: path.join(
        __dirname,
        '../../../../../tools/commander/main/hashWorker.ts',
      ),
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outdir: built,
    logLevel: 'silent',
  });
  files = tempFolder('hash-files');
  for (let index = 0; index < 8; index++) {
    fs.writeFileSync(at(`file${index}.txt`), `content ${index % 2}`);
  }
  fs.writeFileSync(at('big.bin'), Buffer.alloc(64 * 1024 * 1024, 1));
});

afterAll(() => {
  removeFolder(built);
  removeFolder(files);
});

suite('Hashing files in worker threads', () => {
  test('hashes files in worker threads once the worker is built next to it, as hashing in this thread hashes them, and nothing for a file it cannot read', async () => {
    const workers = hashWorkers(built);
    assert.ok(workers);
    try {
      const signal = new AbortController().signal;
      const names = Array.from({ length: 8 }, (_, index) => `file${index}.txt`);
      const hashed = await Promise.all(
        names.map((name) => workers.hash(at(name), undefined, signal)),
      );
      const gone = await workers.hash(at('gone.txt'), undefined, signal);

      assert.deepStrictEqual(
        hashed,
        names.map((name) => hashOf(at(name), undefined)),
      );
      assert.strictEqual(gone, undefined);
    } finally {
      workers.close();
    }
  });

  test('gives nothing for a file asked for once stopped, whether it waits or is being read, and goes on hashing what it is asked for next', async () => {
    const workers = hashWorkers(built);
    assert.ok(workers);
    try {
      const stopping = new AbortController();
      const reads = [
        workers.hash(at('big.bin'), undefined, stopping.signal),
        ...Array.from({ length: 8 }, () =>
          workers.hash(at('big.bin'), undefined, stopping.signal),
        ),
      ];
      stopping.abort();
      const stopped = await Promise.all(reads);
      const after = await workers.hash(
        at('file0.txt'),
        undefined,
        new AbortController().signal,
      );

      assert.ok(
        stopped.every((each) => each === undefined),
        JSON.stringify(stopped),
      );
      assert.deepStrictEqual(after, hashOf(at('file0.txt'), undefined));
    } finally {
      workers.close();
    }
  });

  test('is not there until its worker is built', () => {
    assert.strictEqual(hashWorkers(files), undefined);
  });
});

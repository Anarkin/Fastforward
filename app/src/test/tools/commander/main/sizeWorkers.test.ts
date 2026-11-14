import * as assert from 'node:assert';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { build } from 'esbuild';
import { afterAll, beforeAll, suite, test } from 'vitest';
import {
  FolderSizes,
  walkFolders,
} from '../../../../tools/commander/main/folderSizes';
import {
  sizeWorkers,
  unpacked,
} from '../../../../tools/commander/main/sizeWorkers';
import { nodeSizeReader } from '../../../../tools/commander/main/sizeReaders';
import { removeFolder, tempFolder } from '../../../support/repositories';

let built = '';
let tree = '';

beforeAll(async () => {
  built = tempFolder('size-worker');
  await build({
    entryPoints: {
      sizeWorker: path.join(
        __dirname,
        '../../../../tools/commander/main/sizeWorker.ts',
      ),
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outdir: built,
    logLevel: 'silent',
  });
  tree = tempFolder('size-tree');
  for (let top = 0; top < 6; top++) {
    for (let inner = 0; inner < 5; inner++) {
      const folder = path.join(tree, `top${top}`, `inner${inner}`);
      fs.mkdirSync(folder, { recursive: true });
      fs.writeFileSync(path.join(folder, 'file.bin'), 'x'.repeat(top + inner));
    }
    fs.writeFileSync(path.join(tree, `top${top}`, 'own.bin'), 'x'.repeat(10));
  }
});

afterAll(() => {
  removeFolder(built);
  removeFolder(tree);
});

const koffi =
  process.platform === 'win32'
    ? createRequire(__filename).resolve('koffi')
    : undefined;

suite('Walking folders in worker threads', () => {
  test('counts the sizes of folders in worker threads once the worker is built next to it, as a walk in this thread counts them', async () => {
    const workers = sizeWorkers(built, koffi);
    assert.ok(workers);
    try {
      const names = Array.from({ length: 6 }, (_, top) => `top${top}`);
      const sizes = new FolderSizes(tree, workers, () => {});
      sizes.count(names);
      await sizes.idle();

      for (const name of names) {
        const here = await walkFolders(
          { folders: [path.join(tree, name)], asked: true },
          nodeSizeReader(),
          Number.POSITIVE_INFINITY,
        );
        assert.deepStrictEqual(
          sizes.of(name),
          { bytes: here.bytes, counting: false, unread: 0 },
          name,
        );
      }
    } finally {
      workers.close();
    }
  });

  test('walks nothing asked for once its signal is aborted before a worker takes it', async () => {
    const workers = sizeWorkers(built, koffi);
    assert.ok(workers);
    try {
      const stopped = new AbortController();
      stopped.abort();
      assert.deepStrictEqual(
        await workers.walk(
          { folders: [path.join(tree, 'top0')], asked: true },
          stopped.signal,
        ),
        { bytes: 0, unread: 0, unreadable: false, rest: [] },
      );
    } finally {
      workers.close();
    }
  });

  test('refuses every walk once closed', async () => {
    const workers = sizeWorkers(built, koffi);
    assert.ok(workers);
    workers.close();
    await assert.rejects(
      workers.walk(
        { folders: [path.join(tree, 'top0')], asked: true },
        new AbortController().signal,
      ),
    );
  });

  test('has no workers without the worker built next to it', () => {
    const empty = tempFolder('no-size-worker');
    try {
      assert.strictEqual(sizeWorkers(empty, koffi), undefined);
    } finally {
      removeFolder(empty);
    }
  });

  test('loads koffi in a worker from where the app keeps it unpacked from its asar, as a worker can read no asar', () => {
    assert.strictEqual(
      unpacked(
        path.join(
          'C:',
          'Fastforward',
          'resources',
          'app.asar',
          'node_modules',
          'koffi',
          'index.cjs',
        ),
      ),
      path.join(
        'C:',
        'Fastforward',
        'resources',
        'app.asar.unpacked',
        'node_modules',
        'koffi',
        'index.cjs',
      ),
    );
    const outside = path.join(
      'C:',
      'app',
      'node_modules',
      'koffi',
      'index.cjs',
    );
    assert.strictEqual(unpacked(outside), outside);
  });
});

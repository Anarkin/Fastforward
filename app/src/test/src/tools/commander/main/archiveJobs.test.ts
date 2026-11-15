import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import type {
  PackOptions,
  Packing,
} from '../../../../../tools/commander/main/archiveReader';
import {
  archiveJob,
  archiveTests,
} from '../../../../../tools/commander/main/archiveJobs';
import type { TransferEvent } from '../../../../../tools/commander/main/transferProtocol';
import { removeFolder, tempFolder } from '../../../../helpers/tempFolders';

const ending = (events: readonly TransferEvent[]) =>
  events.filter((event) => event.type !== 'progress');

suite('packing', () => {
  let folder: string;

  beforeEach(() => {
    folder = tempFolder('packing-job');
    fs.writeFileSync(path.join(folder, 'a.txt'), 'abc');
    fs.mkdirSync(path.join(folder, 'docs'));
    fs.writeFileSync(path.join(folder, 'docs', 'b.txt'), 'bcdef');
  });

  afterEach(() => {
    removeFolder(folder);
  });

  const run = async (
    pack: (options: PackOptions) => Promise<Packing>,
    stop = false,
  ) => {
    const events: TransferEvent[] = [];
    const { promise: ended, resolve } = Promise.withResolvers<void>();
    const connection = archiveJob('photos.zip', (options) => pack(options))({
      event: (event) => {
        events.push(event);
        if (event.type === 'done') {
          resolve();
        }
      },
      stopped: () => undefined,
    });
    connection.send({
      type: 'start',
      plan: { sources: [], target: folder, move: false },
    });
    if (stop) {
      connection.send({ type: 'stop' });
    }
    await ended;
    return events;
  };

  test('tells how far 7-Zip got testing the archive once it tests it', async () => {
    assert.deepStrictEqual(
      await run(({ onTotals, onProgress, onTesting }) => {
        onTotals?.({ files: 2, bytes: 8 });
        onTesting?.();
        onProgress?.({ percent: 50, files: 1, current: 'a.txt' });
        return Promise.resolve({ kind: 'packed' });
      }),
      [
        {
          type: 'progress',
          progress: { files: 0, totalFiles: 2, bytes: 0, totalBytes: 8 },
        },
        {
          type: 'progress',
          progress: {
            files: 0,
            totalFiles: 2,
            bytes: 0,
            totalBytes: 8,
            testing: true,
          },
        },
        {
          type: 'progress',
          progress: {
            files: 1,
            totalFiles: 2,
            bytes: 4,
            totalBytes: 8,
            current: 'a.txt',
            testing: true,
          },
        },
        { type: 'done', stopped: false },
      ],
    );
  });

  test('tells the files and bytes 7-Zip is to pack once it has scanned them, then how far it got in them, and is done once packed', async () => {
    assert.deepStrictEqual(
      await run(({ onTotals, onProgress }) => {
        onProgress?.({ percent: 1, files: 0 });
        onTotals?.({ files: 2, bytes: 8 });
        onProgress?.({ percent: 50, files: 1, current: 'docs/b.txt' });
        return Promise.resolve({ kind: 'packed' });
      }),
      [
        {
          type: 'progress',
          progress: { files: 0, totalFiles: 2, bytes: 0, totalBytes: 8 },
        },
        {
          type: 'progress',
          progress: {
            files: 1,
            totalFiles: 2,
            bytes: 4,
            totalBytes: 8,
            current: 'docs/b.txt',
          },
        },
        { type: 'done', stopped: false },
      ],
    );
  });

  test('says why the archive was not packed, what it was packed without, and that it stopped once told to', async () => {
    assert.deepStrictEqual(
      ending(
        await run(() =>
          Promise.resolve({ kind: 'refused', reason: 'disk full' }),
        ),
      ),
      [
        { type: 'failed', name: 'photos.zip', reason: 'disk full' },
        { type: 'done', stopped: false },
      ],
    );
    assert.deepStrictEqual(
      ending(
        await run(() =>
          Promise.resolve({ kind: 'packed', warning: 'locked.txt' }),
        ),
      ),
      [
        { type: 'warned', reason: 'locked.txt' },
        { type: 'done', stopped: false },
      ],
    );
    assert.deepStrictEqual(
      ending(
        await run(
          ({ signal }) =>
            new Promise((_resolve, reject) => {
              if (signal?.aborted === true) {
                reject(new Error('The operation was aborted'));
              }
              signal?.addEventListener('abort', () =>
                reject(new Error('The operation was aborted')),
              );
            }),
          true,
        ),
      ),
      [{ type: 'done', stopped: true }],
    );
  });
});

const testedSoFar = (files: number, bytes: number, current: string) => ({
  type: 'progress',
  progress: { files, totalFiles: 2, bytes, totalBytes: 40, current },
});

suite('archiveTests', () => {
  let folder: string;

  beforeEach(() => {
    folder = tempFolder('testing-archives');
    fs.writeFileSync(path.join(folder, 'a.zip'), 'a'.repeat(30));
    fs.writeFileSync(path.join(folder, 'b.zip'), 'b'.repeat(10));
  });

  afterEach(() => {
    removeFolder(folder);
  });

  const testedBy = async (
    tester: (file: string, options: PackOptions) => Promise<Packing>,
    stop = false,
  ) => {
    const events: TransferEvent[] = [];
    const { promise: ended, resolve } = Promise.withResolvers<void>();
    const connection = archiveTests(
      ['a.zip', 'b.zip'].map((name) => path.join(folder, name)),
      tester,
    )({
      event: (event) => {
        events.push(event);
        if (event.type === 'done') {
          resolve();
        }
      },
      stopped: () => undefined,
    });
    connection.send({
      type: 'start',
      plan: { sources: [], target: folder, move: false },
    });
    if (stop) {
      connection.send({ type: 'stop' });
    }
    await ended;
    return events;
  };

  test('tests the archives one after another, telling how far it got by their sizes and naming the one it tests', async () => {
    assert.deepStrictEqual(
      await testedBy((_file, { onProgress }) => {
        onProgress?.({ percent: 50, files: 3 });
        return Promise.resolve({ kind: 'packed' });
      }),
      [
        testedSoFar(0, 0, 'a.zip'),
        testedSoFar(0, 15, 'a.zip'),
        testedSoFar(1, 30, 'b.zip'),
        testedSoFar(1, 35, 'b.zip'),
        { type: 'done', stopped: false },
      ],
    );
  });

  test('says which archives failed their test and why, testing the rest', async () => {
    assert.deepStrictEqual(
      ending(
        await testedBy((file) =>
          Promise.resolve(
            file.endsWith('a.zip')
              ? { kind: 'refused', reason: 'CRC Failed' }
              : { kind: 'refused', reason: 'Data Error' },
          ),
        ),
      ),
      [
        { type: 'failed', name: 'a.zip', reason: 'CRC Failed' },
        { type: 'failed', name: 'b.zip', reason: 'Data Error' },
        { type: 'done', stopped: false },
      ],
    );
  });

  test('stops within an archive once told to, testing no other', async () => {
    const asked: string[] = [];
    assert.deepStrictEqual(
      ending(
        await testedBy(
          (file, { signal }) =>
            new Promise((_resolve, reject) => {
              asked.push(path.basename(file));
              if (signal?.aborted === true) {
                reject(new Error('The operation was aborted'));
              }
              signal?.addEventListener('abort', () =>
                reject(new Error('The operation was aborted')),
              );
            }),
          true,
        ),
      ),
      [{ type: 'done', stopped: true }],
    );
    assert.ok(asked.length <= 1);
  });
});

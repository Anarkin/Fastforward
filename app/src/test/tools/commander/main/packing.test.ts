import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import type {
  ArchiveReader,
  Packing,
  PackPlan,
} from '../../../../tools/commander/main/archives';
import { archiveJob, packInto } from '../../../../tools/commander/main/packing';
import type { PackOptions } from '../../../../tools/commander/main/archives';
import type { TransferEvent } from '../../../../tools/commander/main/transferProtocol';
import { removeFolder, tempFolder } from '../../../repositories';

suite('packInto', () => {
  let folder: string;
  const at = (name: string) => path.join(folder, name);
  const listed = () =>
    fs
      .readdirSync(folder)
      .toSorted((one, other) => one.localeCompare(other, 'en'))
      .map((name) => `${name} ${fs.readFileSync(at(name), 'utf8')}`);

  beforeEach(() => {
    folder = tempFolder('packing');
  });

  afterEach(() => {
    removeFolder(folder);
  });

  const plan = (volumeBytes?: number): PackPlan => ({
    folder,
    items: ['a.txt'],
    archive: at('photos.zip'),
    format: 'zip',
    level: 'normal',
    ...(volumeBytes !== undefined && { volumeBytes }),
  });

  const writing = (
    parts: readonly string[],
    ended: () => Promise<Packing>,
    seen?: string[][],
  ): ArchiveReader => ({
    list: () => Promise.reject(new Error('Nothing is listed here.')),
    extract: () => Promise.reject(new Error('Nothing is taken out here.')),
    remove: () => Promise.reject(new Error('Nothing is deleted here.')),
    rename: () => Promise.reject(new Error('Nothing is renamed here.')),
    add: () => Promise.reject(new Error('Nothing is added here.')),
    pack: async (_plan, into) => {
      for (const part of parts) {
        fs.writeFileSync(`${into}${part}`, `new${part}`);
      }
      seen?.push(listed());
      return ended();
    },
  });

  test('packs under a name of its own beside the archive, putting it in place of the one there only once packed', async () => {
    fs.writeFileSync(at('photos.zip'), 'old');
    const seen: string[][] = [];
    const packed = await packInto(
      writing([''], () => Promise.resolve({ kind: 'packed' }), seen),
      plan(),
    );

    assert.deepStrictEqual(packed, { kind: 'packed' });
    assert.ok(seen[0]?.includes('photos.zip old'));
    assert.strictEqual(seen[0]?.length, 2);
    assert.deepStrictEqual(listed(), ['photos.zip new']);
  });

  test('puts each volume in place, removing the volumes left of a longer set of the same name', async () => {
    for (const part of ['.001', '.002', '.003']) {
      fs.writeFileSync(at(`photos.zip${part}`), 'old');
    }
    await packInto(
      writing(['.001', '.002'], () => Promise.resolve({ kind: 'packed' })),
      plan(1000),
    );

    assert.deepStrictEqual(listed(), [
      'photos.zip.001 new.001',
      'photos.zip.002 new.002',
    ]);
  });

  test('removes what an earlier pack into the archive left under a name of its own, as one the app quit during, and nothing else', async () => {
    for (const name of [
      'photos.zip.0a1b2c3d.packing',
      'photos.zip.0a1b2c3d.packing.001',
      'photos.zip.mine.packing',
      'other.zip.0a1b2c3d.packing',
    ]) {
      fs.writeFileSync(at(name), 'left');
    }
    await packInto(
      writing([''], () => Promise.resolve({ kind: 'packed' })),
      plan(),
    );

    assert.deepStrictEqual(listed(), [
      'other.zip.0a1b2c3d.packing left',
      'photos.zip new',
      'photos.zip.mine.packing left',
    ]);
  });

  test('removes what it packed once 7-Zip refuses or is stopped, keeping the archive there', async () => {
    fs.writeFileSync(at('photos.zip'), 'old');
    assert.deepStrictEqual(
      await packInto(
        writing(['.001', '.002'], () =>
          Promise.resolve({ kind: 'refused', reason: 'disk full' }),
        ),
        plan(1000),
      ),
      { kind: 'refused', reason: 'disk full' },
    );
    await assert.rejects(
      packInto(
        writing([''], () =>
          Promise.reject(new Error('The operation was aborted')),
        ),
        plan(),
      ),
      /aborted/,
    );

    assert.deepStrictEqual(listed(), ['photos.zip old']);
  });
});

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

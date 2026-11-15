import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import type {
  ArchiveReader,
  Packing,
  PackPlan,
} from '../../../../../tools/commander/main/archiveReader';
import { packInto } from '../../../../../tools/commander/main/packing';
import { strings } from '../../../../../lib/shared/strings';
import { removeFolder, tempFolder } from '../../../../helpers/tempFolders';

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
    test: () => Promise.reject(new Error('Nothing is tested here.')),
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

  test('leaves the files named after the archive with a number that is no volume of 7-Zip, as a dated copy, when it puts volumes in place', async () => {
    for (const part of ['.003', '.0', '.7', '.20240101']) {
      fs.writeFileSync(at(`photos.zip${part}`), 'old');
    }
    await packInto(
      writing(['.001', '.002'], () => Promise.resolve({ kind: 'packed' })),
      plan(1000),
    );

    assert.deepStrictEqual(listed(), [
      'photos.zip.0 old',
      'photos.zip.001 new.001',
      'photos.zip.002 new.002',
      'photos.zip.20240101 old',
      'photos.zip.7 old',
    ]);
  });

  test('removes what an earlier pack into the archive left under a name of its own, its list of items too, as one the app quit during, and nothing else', async () => {
    for (const name of [
      'photos.zip.0a1b2c3d.packing',
      'photos.zip.0a1b2c3d.packing.001',
      'photos.zip.0a1b2c3d.packing.paths',
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

  test('tests the archive once packed, before it is put in place, from its first volume and with its password, and keeps the archive there and nothing of the pack when the test fails', async () => {
    fs.writeFileSync(at('photos.zip'), 'old');
    const tested: unknown[] = [];
    const testing = (passes: boolean): ArchiveReader => ({
      ...writing(['.001', '.002'], () => Promise.resolve({ kind: 'packed' })),
      test: (file, options) => {
        tested.push([
          path.basename(file).replace(/\.[0-9a-f]{8}\./, '.*.'),
          options.password,
        ]);
        return Promise.resolve(
          passes
            ? { kind: 'packed' }
            : { kind: 'refused', reason: 'CRC Failed' },
        );
      },
    });
    const told: string[] = [];
    const encrypted = {
      ...plan(1000),
      test: true,
      password: 'secret',
    };

    assert.deepStrictEqual(
      await packInto(testing(false), encrypted, {
        onTesting: () => told.push('testing'),
      }),
      {
        kind: 'refused',
        reason: strings.commander.archiveTestFailed('CRC Failed'),
      },
    );
    assert.deepStrictEqual(listed(), ['photos.zip old']);
    await packInto(testing(true), encrypted);
    await packInto(testing(true), { ...plan(1000), test: false });

    assert.deepStrictEqual(told, ['testing']);
    assert.deepStrictEqual(tested, [
      ['photos.zip.*.packing.001', 'secret'],
      ['photos.zip.*.packing.001', 'secret'],
    ]);
    assert.deepStrictEqual(listed(), [
      'photos.zip old',
      'photos.zip.001 new.001',
      'photos.zip.002 new.002',
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

import * as assert from 'node:assert';
import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import {
  Archives,
  type OpenedArchive,
  type PackPlan,
} from '../../../../../tools/commander/main/archives';
import type { PackFormat } from '../../../../../tools/commander/shared/packing';
import { plainOf } from '../../../../../lib/shared/strings';
import { removeFolder, tempFolder } from '../../../../helpers/repositories';
import {
  reader,
  byText,
  made,
  madeTree,
  rootItems,
  treeOf,
  writable,
} from './roundTripFixtures';

suite('Archives packed, changed and taken out again', () => {
  let folder: string;
  let source: string;
  let works = 0;
  let archives: Archives;

  const at = (name: string) => path.join(folder, name);

  beforeEach(() => {
    folder = tempFolder('round-trips');
    source = at('source');
    madeTree(source);
    archives = new Archives(reader, process.platform, () => {
      const work = at(`work-${++works}`);
      fs.mkdirSync(work);
      return Promise.resolve(work);
    });
  });

  afterEach(() => {
    writable(folder);
    removeFolder(folder);
  });

  const plan = (
    name: string,
    format: PackFormat,
    more: Partial<PackPlan> = {},
  ): PackPlan => ({
    folder: source,
    items: rootItems,
    archive: at(name),
    format,
    level: 'normal',
    ...more,
  });

  const opened = async (file: string): Promise<OpenedArchive> => {
    const opening = await archives.open(file);
    assert.ok(
      opening.kind === 'opened',
      opening.kind === 'refused' ? plainOf(opening.reason) : opening.kind,
    );
    return opening.archive;
  };

  const takenOut = async (file: string): Promise<Map<string, string>> => {
    const archive = await opened(file);
    const into = at(`out-${++works}`);
    fs.mkdirSync(into);
    const paths = (archive.tree.entries([]) ?? []).flatMap(
      (entry) => archive.tree.item([], entry.name)?.path ?? [],
    );
    const extracted = await archives.extract(archive, paths, { into });
    assert.ok(
      extracted.kind === 'extracted',
      extracted.kind === 'refused' ? plainOf(extracted.reason) : '',
    );
    return treeOf(into);
  };

  const packedFine = async (packing: PackPlan) =>
    assert.deepStrictEqual(await archives.pack(packing), { kind: 'packed' });

  suite('packing', () => {
    test('packs a tree of every kind of item into each format and takes back every file as it was, with its name, its folders, the empty ones too, and its date to the second', async () => {
      const original = treeOf(source);
      for (const format of ['zip', '7z', 'tar', 'tar.gz', 'tar.xz'] as const) {
        const name = `all.${format}`;
        await packedFine(plan(name, format));
        assert.deepStrictEqual(await takenOut(at(name)), original, format);
      }
    });

    test('packs at every compression, storing as it is and packing as small as it can, and takes back the same', async () => {
      const original = treeOf(source);
      for (const format of ['zip', '7z'] as const) {
        for (const level of [
          'store',
          'fastest',
          'normal',
          'maximum',
          'ultra',
        ] as const) {
          const name = `${level}.${format}`;
          await packedFine(plan(name, format, { level }));
          assert.deepStrictEqual(
            await takenOut(at(name)),
            original,
            `${level} ${format}`,
          );
        }
      }
      assert.ok(
        fs.statSync(at('ultra.zip')).size < fs.statSync(at('store.zip')).size,
      );
    });

    test('encrypts a zip with AES-256 or ZipCrypto and a 7z with its names too, taking them back with the password alone', async () => {
      const original = treeOf(source);
      const encrypted: readonly [string, PackFormat, Partial<PackPlan>][] = [
        ['aes.zip', 'zip', { zipCipher: 'aes256' }],
        ['crypto.zip', 'zip', { zipCipher: 'zipCrypto' }],
        ['names.7z', '7z', { encryptNames: true }],
        ['contents.7z', '7z', {}],
      ];
      for (const [name, format, more] of encrypted) {
        await packedFine(plan(name, format, { password: 'secret', ...more }));
        const listing = await reader.list(at(name));
        if (name === 'names.7z') {
          assert.ok(listing.kind === 'refused' && listing.needsPassword, name);
        } else {
          assert.ok(
            listing.kind === 'listed' &&
              listing.items
                .filter((item) => !item.folder && item.size !== 0)
                .every((item) => item.encrypted),
            name,
          );
          const archive = await opened(at(name));
          const refused = await archives.extract(archive, ['old.txt'], {
            into: at(`refused-${name}`),
          });
          assert.ok(
            refused.kind === 'refused' && refused.needsPassword === true,
            name,
          );
        }
        archives.usePassword(at(name), 'secret');
        assert.deepStrictEqual(await takenOut(at(name)), original, name);
      }
    });

    test('cuts a zip, a 7z and a compressed tar into volumes, taking them back together from the first', async () => {
      const original = treeOf(source);
      for (const format of ['zip', '7z', 'tar.gz'] as const) {
        const name = `volumes.${format}`;
        await packedFine(plan(name, format, { volumeBytes: 256 * 1024 }));
        const parts = fs
          .readdirSync(folder)
          .filter((each) => each.startsWith(`${name}.`));
        assert.ok(parts.length > 1, `${format} in ${parts.length} parts`);
        assert.deepStrictEqual(
          await takenOut(at(`${name}.001`)),
          original,
          format,
        );
      }
    });

    test('packs items listed flat in folders of their own with the folders they are in', async () => {
      await packedFine(
        plan('flat.zip', 'zip', {
          items: [path.join('docs', 'deep', 'deeper', 'notes.txt'), 'old.txt'],
        }),
      );
      const original = treeOf(source);
      assert.deepStrictEqual(
        [...(await takenOut(at('flat.zip')))],
        [
          ['docs', 'folder'],
          ['docs/deep', 'folder'],
          ['docs/deep/deeper', 'folder'],
          [
            'docs/deep/deeper/notes.txt',
            original.get('docs/deep/deeper/notes.txt'),
          ],
          ['old.txt', original.get('old.txt')],
        ],
      );
    });

    test('replaces an archive of the name whole rather than adding to it, and removes the parts of an older set of volumes beyond the new ones', async () => {
      made(folder, 'stale/stale.txt', 'Stale.\n');
      await packedFine({
        folder: at('stale'),
        items: ['stale.txt'],
        archive: at('again.zip'),
        format: 'zip',
        level: 'normal',
      });
      await packedFine(plan('again.zip', 'zip'));
      assert.deepStrictEqual(await takenOut(at('again.zip')), treeOf(source));

      for (const part of ['001', '002', '003', '004', '005', '006', '007']) {
        fs.writeFileSync(at(`parts.7z.${part}`), 'old');
      }
      await packedFine(
        plan('parts.7z', '7z', {
          items: ['random.bin'],
          level: 'store',
          volumeBytes: 512 * 1024,
        }),
      );
      assert.deepStrictEqual(
        fs
          .readdirSync(folder)
          .filter((name) => name.startsWith('parts.7z'))
          .toSorted(byText),
        ['parts.7z.001', 'parts.7z.002', 'parts.7z.003'],
      );
    });

    test('tests every format once packed, with its password and from its first volume, putting it in place once it passes', async () => {
      const original = treeOf(source);
      for (const [name, format, more] of [
        ['tested.zip', 'zip', { password: 'secret' }],
        ['tested.7z', '7z', { password: 'secret', encryptNames: true }],
        ['tested.tar', 'tar', {}],
        ['tested.tar.xz', 'tar.xz', { volumeBytes: 256 * 1024 }],
      ] as const) {
        const told: string[] = [];
        assert.deepStrictEqual(
          await archives.pack(plan(name, format, { ...more, test: true }), {
            onTesting: () => told.push('testing'),
          }),
          { kind: 'packed' },
          name,
        );
        assert.deepStrictEqual(told, ['testing'], name);
        archives.usePassword(at(name), 'secret');
        const first = 'volumeBytes' in more ? `${name}.001` : name;
        assert.deepStrictEqual(await takenOut(at(first)), original, name);
      }
    });

    test('finds a byte gone wrong in the archive once packed, keeping the archive there and nothing of the pack', async () => {
      const spoiling = new Archives(
        {
          ...reader,
          pack: async (packing, into, options) => {
            const packed = await reader.pack(packing, into, options);
            const written = fs.readFileSync(into);
            written[Math.floor(written.length / 2)] ^= 0xff;
            fs.writeFileSync(into, written);
            return packed;
          },
        },
        process.platform,
        () => {
          const work = at(`work-${++works}`);
          fs.mkdirSync(work);
          return Promise.resolve(work);
        },
      );
      fs.writeFileSync(at('spoiled.zip'), 'there before');
      const spoiled = await spoiling.pack(
        plan('spoiled.zip', 'zip', {
          items: ['random.bin'],
          level: 'store',
          test: true,
        }),
      );
      assert.ok(spoiled.kind === 'refused');
      assert.match(plainOf(spoiled.reason), /CRC|Data Error/);
      assert.deepStrictEqual(
        fs.readdirSync(folder).filter((name) => name.startsWith('spoiled.zip')),
        ['spoiled.zip'],
      );
      assert.strictEqual(
        fs.readFileSync(at('spoiled.zip'), 'utf8'),
        'there before',
      );
    });

    test('leaves the archive there as it was and nothing of the pack once stopped', async () => {
      made(source, 'big.bin', randomBytes(24 * 1024 * 1024));
      await packedFine(plan('kept.7z', '7z', { items: ['old.txt'] }));
      const before = fs.readFileSync(at('kept.7z'));
      const aborting = new AbortController();
      await assert.rejects(
        archives.pack(plan('kept.7z', '7z', { level: 'ultra' }), {
          signal: aborting.signal,
          onTotals: () => aborting.abort(),
        }),
      );
      assert.deepStrictEqual(fs.readFileSync(at('kept.7z')), before);
      assert.deepStrictEqual(
        fs.readdirSync(folder).filter((name) => name.startsWith('kept.7z')),
        ['kept.7z'],
      );
    });

    test.skipIf(process.platform === 'win32')(
      'packs what it can read, naming the folder it could not',
      async () => {
        fs.mkdirSync(path.join(source, 'closed'));
        made(source, 'closed/secret.txt', 'Secret.\n');
        fs.chmodSync(path.join(source, 'closed'), 0o000);
        try {
          const packing = await archives.pack(
            plan('partly.zip', 'zip', { items: ['old.txt', 'closed'] }),
          );
          assert.ok(packing.kind === 'packed');
          assert.match(plainOf(packing.warning ?? ''), /closed/);
        } finally {
          fs.chmodSync(path.join(source, 'closed'), 0o755);
        }
        assert.ok((await takenOut(at('partly.zip'))).has('old.txt'));
      },
    );
  });

  suite('testing', () => {
    test('passes a sound archive of every format, from the first of its volumes and with its password, and fails one with a byte gone wrong or a wrong password, and a file that is no archive, saying why', async () => {
      for (const [name, format, more] of [
        ['sound.zip', 'zip', {}],
        ['sound.7z', '7z', { password: 'secret', encryptNames: true }],
        ['sound.tar.gz', 'tar.gz', {}],
        ['sound.zip', 'zip', { volumeBytes: 256 * 1024 }],
      ] as const) {
        await packedFine(plan(name, format, more));
        archives.usePassword(at(name), 'secret');
        const first = 'volumeBytes' in more ? `${name}.001` : name;
        assert.deepStrictEqual(await archives.test(at(first)), {
          kind: 'packed',
        });
      }

      await packedFine(
        plan('spoiled.zip', 'zip', { items: ['random.bin'], level: 'store' }),
      );
      const written = fs.readFileSync(at('spoiled.zip'));
      written[Math.floor(written.length / 2)] ^= 0xff;
      fs.writeFileSync(at('spoiled.zip'), written);
      const spoiled = await archives.test(at('spoiled.zip'));
      assert.ok(spoiled.kind === 'refused');
      assert.match(plainOf(spoiled.reason), /CRC|Data Error/);

      await packedFine(plan('locked.7z', '7z', { password: 'right' }));
      archives.usePassword(at('locked.7z'), 'wrong');
      const locked = await archives.test(at('locked.7z'));
      assert.ok(locked.kind === 'refused' && locked.needsPassword === true);

      fs.writeFileSync(at('plain.zip'), 'Plain text, named as a zip.\n');
      const plain = await archives.test(at('plain.zip'));
      assert.ok(plain.kind === 'refused');
      assert.match(plainOf(plain.reason), /Cannot open the file as/);
    });
  });
});

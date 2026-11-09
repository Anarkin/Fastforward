import * as assert from 'node:assert';
import { createHash, randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import {
  Archives,
  type OpenedArchive,
  type PackPlan,
} from '../../../../tools/commander/main/archives';
import {
  sevenZipAt,
  sevenZipProgram,
  sevenZipReader,
} from '../../../../tools/commander/main/sevenZip';
import type { PackFormat } from '../../../../tools/commander/shared/packing';
import { removeFolder, tempFolder } from '../../../repositories';

const appFolder = path.join(__dirname, '..', '..', '..', '..', '..');

const reader = sevenZipReader(
  sevenZipAt(
    sevenZipProgram({
      packaged: false,
      resourcesPath: '',
      appPath: appFolder,
      platform: process.platform,
      arch: process.arch,
    }),
  ),
);

const old = new Date(Date.UTC(2001, 1, 3, 4, 5, 6));

const byText = (one: string, other: string) => one.localeCompare(other, 'en');

function made(root: string, relative: string, content: string | Buffer): void {
  const file = path.join(root, ...relative.split('/'));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function madeTree(root: string): void {
  made(root, 'docs/readme.md', 'A line of the readme.\n'.repeat(2000));
  made(root, 'docs/deep/deeper/notes.txt', 'Notes deep down.\n');
  fs.mkdirSync(path.join(root, 'empty-folder'), { recursive: true });
  made(root, 'empty.txt', '');
  made(root, 'random.bin', randomBytes(1024 * 1024));
  made(root, 'ünïcödé – 名前.txt', 'A name beyond ASCII.\n');
  made(root, 'with space and.dots.v2.txt', 'Spaces and dots.\n');
  made(root, '.dot-file', 'Named with a leading dot.\n');
  made(root, 'old.txt', 'Old.\n');
  fs.utimesSync(path.join(root, 'old.txt'), old, old);
  made(root, 'read-only.txt', 'Read only.\n');
  fs.chmodSync(path.join(root, 'read-only.txt'), 0o444);
}

const rootItems = [
  '.dot-file',
  'docs',
  'empty-folder',
  'empty.txt',
  'old.txt',
  'random.bin',
  'read-only.txt',
  'with space and.dots.v2.txt',
  'ünïcödé – 名前.txt',
];

function treeOf(root: string): Map<string, string> {
  const tree = new Map<string, string>();
  const walk = (folder: string, under: string) => {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const relative = `${under}${entry.name}`;
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) {
        tree.set(relative, 'folder');
        walk(file, `${relative}/`);
      } else {
        const content = fs.readFileSync(file);
        const seconds = Math.floor(fs.statSync(file).mtimeMs / 1000);
        tree.set(
          relative,
          `${content.length} ${createHash('sha256').update(content).digest('hex')} ${seconds}`,
        );
      }
    }
  };
  walk(root, '');
  return new Map([...tree].toSorted(([one], [other]) => byText(one, other)));
}

function writable(root: string): void {
  if (!fs.existsSync(root)) {
    return;
  }
  for (const entry of fs.readdirSync(root, {
    recursive: true,
    encoding: 'utf8',
  })) {
    fs.chmodSync(path.join(root, entry), 0o777);
  }
}

const withoutDates = (tree: Map<string, string>) =>
  new Map([...tree].map(([name, kind]) => [name, kind.replace(/ \d+$/, '')]));

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
      opening.kind === 'refused' ? opening.reason : opening.kind,
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
      extracted.kind === 'refused' ? extracted.reason : '',
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
          assert.match(packing.warning ?? '', /closed/);
        } finally {
          fs.chmodSync(path.join(source, 'closed'), 0o755);
        }
        assert.ok((await takenOut(at('partly.zip'))).has('old.txt'));
      },
    );
  });

  suite('changing', () => {
    const changeable = ['zip', '7z', 'tar'] as const;

    test('deletes a file and a folder with all in it, keeping every other file as it was', async () => {
      for (const format of changeable) {
        const name = `delete.${format}`;
        await packedFine(plan(name, format));
        assert.deepStrictEqual(
          await archives.remove(await opened(at(name)), [
            'docs/deep',
            'old.txt',
          ]),
          { kind: 'packed' },
        );
        const expected = treeOf(source);
        for (const gone of [
          'docs/deep',
          'docs/deep/deeper',
          'docs/deep/deeper/notes.txt',
          'old.txt',
        ]) {
          expected.delete(gone);
        }
        assert.deepStrictEqual(await takenOut(at(name)), expected, format);
      }
    });

    test('renames a file and a folder with all in it, their contents and dates as they were', async () => {
      for (const format of changeable) {
        const name = `rename.${format}`;
        await packedFine(plan(name, format));
        const archive = await opened(at(name));
        assert.deepStrictEqual(
          await archives.rename(archive, 'docs', 'documents'),
          { kind: 'packed' },
        );
        assert.deepStrictEqual(
          await archives.rename(await opened(at(name)), 'old.txt', 'older.txt'),
          { kind: 'packed' },
        );
        const expected = new Map(
          [...treeOf(source)]
            .map(([each, kind]): [string, string] => [
              each
                .replace(/^docs(?=\/|$)/, 'documents')
                .replace(/^old\.txt$/, 'older.txt'),
              kind,
            ])
            .toSorted(([one], [other]) => byText(one, other)),
        );
        assert.deepStrictEqual(await takenOut(at(name)), expected, format);
      }
    });

    test('makes empty folders at its root and deep in it, keeping every other file as it was', async () => {
      for (const format of changeable) {
        const name = `folders.${format}`;
        await packedFine(plan(name, format));
        await archives.addFolder(await opened(at(name)), [], 'fresh');
        await archives.addFolder(
          await opened(at(name)),
          ['docs', 'deep'],
          'fresher',
        );
        const expected = treeOf(source);
        expected.set('fresh', 'folder');
        expected.set('docs/deep/fresher', 'folder');
        assert.deepStrictEqual(
          await takenOut(at(name)),
          new Map(
            [...expected].toSorted(([one], [other]) => byText(one, other)),
          ),
          format,
        );
      }
    });

    test('adds files and folders at its root and in a folder of it, replacing a file of the name with the new one, with their dates', async () => {
      const added = at('added');
      made(added, 'new.txt', 'New.\n');
      made(added, 'old.txt', 'Newer than the old one.\n');
      made(added, 'more/inside.txt', 'Inside.\n');
      made(added, 'flat/deep/flat.txt', 'Listed flat.\n');
      fs.utimesSync(path.join(added, 'new.txt'), old, old);
      for (const format of changeable) {
        const name = `add.${format}`;
        await packedFine(plan(name, format));
        assert.deepStrictEqual(
          await archives.addItems(await opened(at(name)), [], added, [
            'new.txt',
            'old.txt',
            'more',
          ]),
          { kind: 'packed' },
        );
        assert.deepStrictEqual(
          await archives.addItems(
            await opened(at(name)),
            ['docs', 'deep'],
            added,
            ['new.txt', path.join('flat', 'deep', 'flat.txt')],
          ),
          { kind: 'packed' },
        );
        const brought = treeOf(added);
        const expected = treeOf(source);
        for (const [each, kind] of [
          ['new.txt', brought.get('new.txt')],
          ['old.txt', brought.get('old.txt')],
          ['more', 'folder'],
          ['more/inside.txt', brought.get('more/inside.txt')],
          ['docs/deep/new.txt', brought.get('new.txt')],
          ['docs/deep/flat.txt', brought.get('flat/deep/flat.txt')],
        ] as const) {
          expected.set(each, kind ?? '');
        }
        assert.deepStrictEqual(
          await takenOut(at(name)),
          new Map(
            [...expected].toSorted(([one], [other]) => byText(one, other)),
          ),
          format,
        );
      }
    });

    test('keeps the names of a 7z encrypted and the files of a zip encrypted with AES-256 as they change, by the password given once', async () => {
      const added = at('added');
      made(added, 'new.txt', 'New.\n');
      await packedFine(
        plan('names.7z', '7z', { password: 'secret', encryptNames: true }),
      );
      await packedFine(
        plan('aes.zip', 'zip', { password: 'secret', zipCipher: 'aes256' }),
      );
      for (const name of ['names.7z', 'aes.zip']) {
        archives.usePassword(at(name), 'secret');
        for (const changed of [
          await archives.remove(await opened(at(name)), ['empty.txt']),
          await archives.rename(await opened(at(name)), 'old.txt', 'older.txt'),
          await archives.addItems(await opened(at(name)), [], added, [
            'new.txt',
          ]),
        ]) {
          assert.deepStrictEqual(changed, { kind: 'packed' }, name);
        }
        const listing = await reader.list(at(name));
        if (name === 'names.7z') {
          assert.ok(listing.kind === 'refused' && listing.needsPassword);
        } else {
          assert.ok(
            listing.kind === 'listed' &&
              listing.items.find((item) => item.path === 'new.txt')
                ?.encrypted === true,
          );
        }
        const expected = treeOf(source);
        expected.delete('empty.txt');
        expected.set('older.txt', expected.get('old.txt') ?? '');
        expected.delete('old.txt');
        expected.set('new.txt', treeOf(added).get('new.txt') ?? '');
        assert.deepStrictEqual(
          withoutDates(await takenOut(at(name))),
          withoutDates(
            new Map(
              [...expected].toSorted(([one], [other]) => byText(one, other)),
            ),
          ),
          name,
        );
      }
    });

    test('changes nothing of the tar inside a compressed tar, saying it cannot be changed yet', async () => {
      await packedFine(plan('all.tar.gz', 'tar.gz'));
      const before = fs.readFileSync(at('all.tar.gz'));
      const archive = await opened(at('all.tar.gz'));
      for (const changed of [
        await archives.remove(archive, ['old.txt']),
        await archives.rename(archive, 'old.txt', 'older.txt'),
        await archives.addFolder(archive, [], 'fresh'),
      ]) {
        assert.strictEqual(changed.kind, 'refused');
      }
      assert.deepStrictEqual(fs.readFileSync(at('all.tar.gz')), before);
    });
  });
});

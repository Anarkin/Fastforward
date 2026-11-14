import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import type { PackFormat } from '../../../../../tools/commander/shared/packing';
import { plainOf, strings } from '../../../../../lib/shared/strings';
import { removeFolder, tempFolder } from '../../../../helpers/repositories';
import {
  reader,
  old,
  byText,
  made,
  madeTree,
  rootItems,
  treeOf,
  writable,
  withoutDates,
} from './roundTripFixtures';
import {
  Archives,
  type OpenedArchive,
  type PackPlan,
} from '../../../../../tools/commander/main/archives';
import { itemsAt } from '../../../../../tools/commander/main/archiveFiles';

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

    test('changes nothing of an archive cut into volumes, which 7-Zip cannot change, saying so', async () => {
      await packedFine(plan('parts.zip', 'zip', { volumeBytes: 256 * 1024 }));
      const parts = () =>
        fs
          .readdirSync(folder)
          .filter((name) => name.startsWith('parts.zip'))
          .map((name) => fs.readFileSync(at(name)).toString('base64'));
      const before = parts();
      const archive = await opened(at('parts.zip.001'));
      for (const changed of [
        await archives.remove(archive, ['old.txt']),
        await archives.rename(archive, 'old.txt', 'older.txt'),
        await archives.addFolder(archive, [], 'fresh'),
      ]) {
        assert.deepStrictEqual(changed, {
          kind: 'refused',
          reason: strings.commander.archiveInVolumes('parts.zip.001'),
        });
      }
      assert.deepStrictEqual(parts(), before);
    });

    test('says why a read-only archive cannot be changed, leaving it as it was', async () => {
      await packedFine(plan('read-only.zip', 'zip'));
      fs.chmodSync(at('read-only.zip'), 0o444);
      const before = fs.readFileSync(at('read-only.zip'));
      const removed = await archives.remove(await opened(at('read-only.zip')), [
        'old.txt',
      ]);
      assert.ok(removed.kind === 'refused');
      assert.doesNotMatch(plainOf(removed.reason), /ended with code/);
      assert.deepStrictEqual(fs.readFileSync(at('read-only.zip')), before);
      assert.deepStrictEqual(
        fs
          .readdirSync(folder)
          .filter((name) => name.startsWith('read-only.zip')),
        ['read-only.zip'],
      );
    });

    test('renames to another case alone, and an item added in another case replaces the one of the name where names ignore case, as on Windows', async () => {
      await packedFine(plan('case.zip', 'zip'));
      assert.deepStrictEqual(
        await archives.rename(
          await opened(at('case.zip')),
          'old.txt',
          'OLD.txt',
        ),
        { kind: 'packed' },
      );
      const added = at('added');
      made(added, 'EMPTY.TXT', 'Not empty any more.\n');
      await archives.addItems(await opened(at('case.zip')), [], added, [
        'EMPTY.TXT',
      ]);
      const names = [...(await takenOut(at('case.zip'))).keys()];
      assert.ok(names.includes('OLD.txt') && !names.includes('old.txt'));
      if (process.platform === 'win32') {
        assert.ok(names.includes('EMPTY.TXT') && !names.includes('empty.txt'));
      }
    });

    test('makes no archive anew once the one changed is gone, saying so', async () => {
      await packedFine(plan('gone.zip', 'zip'));
      const archive = await opened(at('gone.zip'));
      fs.rmSync(at('gone.zip'));
      const added = at('added');
      made(added, 'new.txt', 'New.\n');

      for (const changed of [
        await archives.addItems(archive, ['docs'], added, ['new.txt']),
        await archives.addFolder(archive, [], 'fresh'),
        await archives.remove(archive, ['old.txt']),
        await archives.rename(archive, 'old.txt', 'older.txt'),
      ]) {
        assert.deepStrictEqual(changed, {
          kind: 'refused',
          reason: strings.commander.archiveGone('gone.zip'),
        });
      }
      assert.ok(!fs.existsSync(at('gone.zip')));
    });

    test('keeps a valid archive once every item of it is deleted', async () => {
      await packedFine(plan('emptied.7z', '7z', { items: ['old.txt'] }));
      assert.deepStrictEqual(
        await archives.remove(await opened(at('emptied.7z')), ['old.txt']),
        { kind: 'packed' },
      );
      const listing = await reader.list(at('emptied.7z'));
      assert.deepStrictEqual(listing.kind === 'listed' && listing.items, []);
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

  suite('putting back', () => {
    test('puts a file changed in its copy back in place of itself, the copy taken out with its folders or without them, in each format whose names are encrypted or not, keeping every other file as it was', async () => {
      const cases = [
        { name: 'back.zip', format: 'zip', flat: false },
        { name: 'flat.zip', format: 'zip', flat: true },
        { name: 'back.tar', format: 'tar', flat: false },
        { name: 'back.7z', format: '7z', flat: true, password: 'secret' },
      ] as const;
      for (const { name, format, flat, ...more } of cases) {
        const file = at(name);
        await packedFine(
          plan(
            name,
            format,
            'password' in more ? { ...more, encryptNames: true } : {},
          ),
        );
        if ('password' in more) {
          archives.usePassword(file, more.password);
        }
        const archive = await opened(file);
        const inner = ['docs', 'deep', 'deeper'];
        const extracted = await archives.extract(
          archive,
          [archive.tree.item(inner, 'notes.txt')?.path ?? ''],
          { withoutFolders: flat },
        );
        assert.ok(extracted.kind === 'extracted', name);
        const [copy] = await itemsAt(extracted.folder, flat ? 0 : inner.length);
        assert.ok(copy !== undefined, name);
        fs.writeFileSync(copy, 'Changed in its copy.\n');

        assert.deepStrictEqual(
          await archives.addItems(archive, inner, path.dirname(copy), [
            path.basename(copy),
          ]),
          { kind: 'packed' },
          name,
        );
        const expected = withoutDates(treeOf(source));
        expected.set(
          'docs/deep/deeper/notes.txt',
          withoutDates(treeOf(path.dirname(copy))).get('notes.txt') ?? '',
        );
        assert.deepStrictEqual(
          withoutDates(await takenOut(file)),
          expected,
          name,
        );
      }
    });
  });
});

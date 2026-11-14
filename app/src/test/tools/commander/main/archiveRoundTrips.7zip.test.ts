import * as assert from 'node:assert';
import { createHash, randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import {
  Archives,
  itemsAt,
  type OpenedArchive,
  type PackPlan,
} from '../../../../tools/commander/main/archives';
import {
  sevenZipAt,
  sevenZipProgram,
  sevenZipReader,
} from '../../../../tools/commander/main/sevenZip';
import type { ClashReply } from '../../../../tools/commander/main/transfer';
import type { TransferEvent } from '../../../../tools/commander/main/transferProtocol';
import type { ConnectTransfer } from '../../../../tools/commander/main/transfers';
import { transferServer } from '../../../../tools/commander/main/transferServer';
import { unpackingFirst } from '../../../../tools/commander/main/unpacking';
import { copiedBetween } from '../../../../tools/commander/main/betweenArchives';
import type { PackFormat } from '../../../../tools/commander/shared/packing';
import { plainOf, strings } from '../../../../lib/shared/strings';
import { removeFolder, tempFolder } from '../../../support/repositories';

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

const inProcess =
  (answers: ClashReply[]): ConnectTransfer =>
  (listener) => {
    const receive = transferServer((event) => {
      if (event.type === 'clash') {
        setImmediate(() =>
          receive({
            type: 'answer',
            reply: answers.shift() ?? { answer: 'stop', all: false },
          }),
        );
      }
      listener.event(event);
    });
    return { send: receive, dispose: () => undefined };
  };

const only = (tree: Map<string, string>, kept: (name: string) => boolean) =>
  new Map([...tree].filter(([name]) => kept(name)));

const underDocs = (name: string) => name === 'docs' || name.startsWith('docs/');

const docsOrOld = (name: string) => underDocs(name) || name === 'old.txt';

const deepOrOld = (name: string) =>
  name.startsWith('docs/deep') || name === 'old.txt';

const sortedTree = (tree: Map<string, string>) =>
  new Map([...tree].toSorted(([one], [other]) => byText(one, other)));

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

  const madeTarget = (name: string) => {
    const target = at(name);
    fs.mkdirSync(target);
    return target;
  };

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

  const movedOutOf = async (
    file: string,
    names: readonly string[],
    target: string,
    {
      inner = [],
      flat = false,
      answers = [],
    }: {
      readonly inner?: readonly string[];
      readonly flat?: boolean;
      readonly answers?: ClashReply[];
    } = {},
  ) => {
    const archive = await opened(file);
    const items = names.map((name) => {
      const parts = name.split('/');
      return {
        inner: [...inner, ...parts.slice(0, -1)],
        name: parts.at(-1) ?? name,
      };
    });
    const events: TransferEvent[] = [];
    const { promise: ended, resolve } = Promise.withResolvers<void>();
    const connection = unpackingFirst(
      {
        archives,
        archive,
        paths: items.flatMap(
          (item) => archive.tree.item(item.inner, item.name)?.path ?? [],
        ),
        depth: inner.length,
        withoutFolders: flat,
        ...archive.tree.totals(items),
        moving: {
          roots: items.flatMap(
            (item) => archive.tree.branch(item.inner, item.name) ?? [],
          ),
          platform: process.platform,
        },
      },
      inProcess(answers),
    )({
      event: (event) => {
        events.push(event);
        if (event.type === 'done') {
          resolve();
        }
      },
      stopped: () => resolve(),
    });
    connection.send({
      type: 'start',
      plan: { sources: [], target, move: true },
    });
    await ended;
    connection.dispose();
    return events.filter(
      (event) => event.type !== 'progress' && event.type !== 'clash',
    );
  };

  const between = async (
    fromFile: string,
    names: readonly string[],
    intoFile: string,
    inner: readonly string[],
    {
      fromInner = [],
      flat = false,
      move = false,
    }: {
      readonly fromInner?: readonly string[];
      readonly flat?: boolean;
      readonly move?: boolean;
    } = {},
  ) => {
    const from = await opened(fromFile);
    const items = names.map((name) => {
      const parts = name.split('/');
      return {
        inner: [...fromInner, ...parts.slice(0, -1)],
        name: parts.at(-1) ?? name,
      };
    });
    return copiedBetween(
      archives,
      {
        archive: from,
        paths: items.flatMap(
          (item) => from.tree.item(item.inner, item.name)?.path ?? [],
        ),
        depth: fromInner.length,
        withoutFolders: flat,
        ...from.tree.totals(items),
        roots: items.flatMap(
          (item) => from.tree.branch(item.inner, item.name) ?? [],
        ),
        platform: process.platform,
      },
      { archive: await opened(intoFile), inner },
      move,
      {},
    );
  };

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

  suite('between archives', () => {
    test('copies a file and a folder with all in it from each format into a folder of a 7z whose names are encrypted, keeping the first archive as it was', async () => {
      for (const format of ['zip', 'tar', '7z'] as const) {
        const fromName = `from.${format}`;
        const intoName = `into-${format}.7z`;
        await packedFine(plan(fromName, format));
        await packedFine(
          plan(intoName, '7z', {
            items: ['old.txt'],
            password: 'secret',
            encryptNames: true,
          }),
        );
        archives.usePassword(at(intoName), 'secret');

        assert.deepStrictEqual(
          await between(at(fromName), ['docs', 'old.txt'], at(intoName), [
            'sub',
          ]),
          { kind: 'packed' },
          format,
        );
        const sourceTree = treeOf(source);
        const expected = new Map([
          ['old.txt', sourceTree.get('old.txt') ?? ''],
          ['sub', 'folder'],
        ]);
        for (const [name, kind] of only(sourceTree, docsOrOld)) {
          expected.set(`sub/${name}`, kind);
        }
        assert.deepStrictEqual(
          withoutDates(await takenOut(at(intoName))),
          withoutDates(sortedTree(expected)),
          format,
        );
        assert.deepStrictEqual(
          await takenOut(at(fromName)),
          sourceTree,
          format,
        );
      }
    });

    test('moves items from a zip into a tar, and within one zip from its root into a folder of it, deleting them from where they were only once added', async () => {
      await packedFine(plan('move.zip', 'zip'));
      await packedFine(plan('move.tar', 'tar', { items: ['empty.txt'] }));
      const sourceTree = treeOf(source);

      assert.deepStrictEqual(
        await between(at('move.zip'), ['docs', 'old.txt'], at('move.tar'), [], {
          move: true,
        }),
        { kind: 'packed' },
      );
      assert.deepStrictEqual(
        withoutDates(await takenOut(at('move.zip'))),
        withoutDates(only(sourceTree, (each) => !docsOrOld(each))),
      );
      assert.deepStrictEqual(
        withoutDates(await takenOut(at('move.tar'))),
        withoutDates(
          only(sourceTree, (each) => docsOrOld(each) || each === 'empty.txt'),
        ),
      );

      await packedFine(plan('same.zip', 'zip'));
      assert.deepStrictEqual(
        await between(
          at('same.zip'),
          ['old.txt', 'empty.txt'],
          at('same.zip'),
          ['docs'],
          { move: true },
        ),
        { kind: 'packed' },
      );
      const within = only(
        sourceTree,
        (each) => each !== 'old.txt' && each !== 'empty.txt',
      );
      within.set('docs/old.txt', sourceTree.get('old.txt') ?? '');
      within.set('docs/empty.txt', sourceTree.get('empty.txt') ?? '');
      assert.deepStrictEqual(
        withoutDates(await takenOut(at('same.zip'))),
        withoutDates(sortedTree(within)),
      );
    });

    test('copies the files of folders listed flat into the folder of another archive without their folders', async () => {
      await packedFine(plan('flat.zip', 'zip'));
      await packedFine(plan('flat-into.zip', 'zip', { items: ['old.txt'] }));
      assert.deepStrictEqual(
        await between(
          at('flat.zip'),
          ['readme.md', 'deep/deeper/notes.txt'],
          at('flat-into.zip'),
          [],
          { fromInner: ['docs'], flat: true },
        ),
        { kind: 'packed' },
      );
      const sourceTree = treeOf(source);
      assert.deepStrictEqual(
        withoutDates(await takenOut(at('flat-into.zip'))),
        withoutDates(
          sortedTree(
            new Map([
              ['notes.txt', sourceTree.get('docs/deep/deeper/notes.txt') ?? ''],
              ['old.txt', sourceTree.get('old.txt') ?? ''],
              ['readme.md', sourceTree.get('docs/readme.md') ?? ''],
            ]),
          ),
        ),
      );
    });
  });

  suite('moving out', () => {
    test('moves a file and a folder with all in it out of each format, deleting them from the archive once moved and keeping every other file of it as it was', async () => {
      for (const format of ['zip', '7z', 'tar'] as const) {
        const name = `move.${format}`;
        await packedFine(plan(name, format));
        const target = madeTarget(`target-${format}`);

        assert.deepStrictEqual(
          await movedOutOf(at(name), ['docs', 'old.txt'], target),
          [{ type: 'done', stopped: false }],
          format,
        );
        assert.deepStrictEqual(
          treeOf(target),
          only(treeOf(source), docsOrOld),
          format,
        );
        assert.deepStrictEqual(
          await takenOut(at(name)),
          only(treeOf(source), (each) => !docsOrOld(each)),
          format,
        );
      }
    });

    test('keeps in the archive a file whose move was skipped, as one of its name was there already, and the folders holding it, in a 7z whose names are encrypted too', async () => {
      await packedFine(
        plan('skipped.7z', '7z', { password: 'secret', encryptNames: true }),
      );
      archives.usePassword(at('skipped.7z'), 'secret');
      const target = madeTarget('target');
      made(target, 'docs/readme.md', 'Already there.\n');
      const there = treeOf(target).get('docs/readme.md');

      assert.deepStrictEqual(
        await movedOutOf(at('skipped.7z'), ['docs', 'old.txt'], target, {
          answers: [{ answer: 'skip', all: false }],
        }),
        [{ type: 'done', stopped: false }],
      );
      const sourceTree = treeOf(source);
      const intoTarget = only(sourceTree, deepOrOld);
      intoTarget.set('docs', 'folder');
      intoTarget.set('docs/readme.md', there ?? '');
      assert.deepStrictEqual(
        treeOf(target),
        new Map(
          [...intoTarget].toSorted(([one], [other]) => byText(one, other)),
        ),
      );
      assert.deepStrictEqual(
        withoutDates(await takenOut(at('skipped.7z'))),
        withoutDates(only(sourceTree, (each) => !deepOrOld(each))),
      );
    });

    test('moves a folder out of a folder of the archive, and the files of its folders listed flat, deleting only them', async () => {
      await packedFine(plan('inner.zip', 'zip'));
      const deep = madeTarget('deep');
      assert.deepStrictEqual(
        await movedOutOf(at('inner.zip'), ['deep'], deep, { inner: ['docs'] }),
        [{ type: 'done', stopped: false }],
      );
      const sourceTree = treeOf(source);
      assert.deepStrictEqual(
        [...treeOf(deep).keys()],
        ['deep', 'deep/deeper', 'deep/deeper/notes.txt'],
      );
      assert.deepStrictEqual(
        await takenOut(at('inner.zip')),
        only(sourceTree, (each) => !each.startsWith('docs/deep')),
      );

      await packedFine(plan('flat.zip', 'zip'));
      const flat = madeTarget('flat');
      assert.deepStrictEqual(
        await movedOutOf(
          at('flat.zip'),
          ['readme.md', 'deep/deeper/notes.txt'],
          flat,
          { inner: ['docs'], flat: true },
        ),
        [{ type: 'done', stopped: false }],
      );
      assert.deepStrictEqual(
        treeOf(flat),
        new Map([
          ['notes.txt', sourceTree.get('docs/deep/deeper/notes.txt') ?? ''],
          ['readme.md', sourceTree.get('docs/readme.md') ?? ''],
        ]),
      );
      assert.deepStrictEqual(
        await takenOut(at('flat.zip')),
        only(
          sourceTree,
          (each) =>
            each !== 'docs/readme.md' && each !== 'docs/deep/deeper/notes.txt',
        ),
      );
    });

    test('keeps in the archive both files of one name in two folders listed flat, as one takes the place of the other once taken out, saying so', async () => {
      const twins = at('twins');
      made(twins, 'one/same.txt', 'One.\n');
      made(twins, 'two/same.txt', 'Two.\n');
      made(twins, 'single.txt', 'Single.\n');
      await packedFine({
        folder: twins,
        items: ['one', 'two', 'single.txt'],
        archive: at('twins.zip'),
        format: 'zip',
        level: 'normal',
      });
      const target = madeTarget('target');

      assert.deepStrictEqual(
        await movedOutOf(
          at('twins.zip'),
          ['one/same.txt', 'two/same.txt', 'single.txt'],
          target,
          { flat: true },
        ),
        [
          {
            type: 'warned',
            reason: strings.commander.keptUnmatched('twins.zip', 2),
          },
          { type: 'done', stopped: false },
        ],
      );
      assert.deepStrictEqual(
        [...treeOf(target).keys()],
        ['same.txt', 'single.txt'],
      );
      assert.deepStrictEqual(
        [...(await takenOut(at('twins.zip'))).keys()],
        ['one', 'one/same.txt', 'two', 'two/same.txt'],
      );
    });
  });
});

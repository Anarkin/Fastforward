import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { crc32 } from 'node:zlib';
import { afterEach, beforeEach, suite, test } from 'vitest';
import {
  Archives,
  type OpenedArchive,
} from '../../../../../tools/commander/main/archives';
import type { PackPlan } from '../../../../../tools/commander/main/archiveReader';
import type { ClashReply } from '../../../../../tools/commander/main/transfer';
import type { TransferEvent } from '../../../../../tools/commander/main/transferProtocol';
import { unpackingFirst } from '../../../../../tools/commander/main/unpacking';
import type { PackFormat } from '../../../../../tools/commander/shared/packing';
import { plainOf } from '../../../../../lib/shared/sentences';
import { strings } from '../../../../../lib/shared/strings';
import {
  reader,
  byText,
  made,
  madeTree,
  rootItems,
  treeOf,
  writable,
  withoutDates,
  inProcess,
  only,
  docsOrOld,
  deepOrOld,
} from './roundTripFixtures';
import { removeFolder, tempFolder } from '../../../../helpers/tempFolders';

function storedZip(entries: readonly (readonly [string, string])[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of entries) {
    const nameBytes = Buffer.from(name, 'utf8');
    const data = Buffer.from(text, 'utf8');
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, data);
    centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + data.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

function contentsUnder(root: string): string[] {
  return fs
    .readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) =>
      fs.readFileSync(path.join(entry.parentPath, entry.name), 'utf8'),
    );
}

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

    test('loses no file of an archive whose entries the system takes out under one name, as two entries of one name or a:b.txt beside a_b.txt on Windows, 7-Zip writing the second over the first and the move deleting both from the archive', async () => {
      const file = at('colliding.zip');
      const entries = [
        ['a_b.txt', 'first file'],
        ['a:b.txt', 'colon file'],
        ['dup.txt', 'dup one'],
        ['dup.txt', 'dup two'],
        ['plain.txt', 'plain file'],
      ] as const;
      fs.writeFileSync(file, storedZip(entries));
      const target = madeTarget('target');
      const archive = await opened(file);
      const names = (archive.tree.entries([]) ?? []).map((entry) => entry.name);

      await movedOutOf(file, names, target);

      const left = await opened(file);
      const leftPaths = (left.tree.entries([]) ?? []).flatMap(
        (entry) => left.tree.item([], entry.name)?.path ?? [],
      );
      const into = madeTarget('left');
      if (leftPaths.length > 0) {
        await archives.extract(left, leftPaths, { into });
      }
      const kept = [...contentsUnder(target), ...contentsUnder(into)];
      for (const [, text] of entries) {
        assert.ok(kept.includes(text), `${text} lost: ${JSON.stringify(kept)}`);
      }
      assert.ok(contentsUnder(target).includes('plain file'));
    });

    test('keeps in the archive both files of one name in two folders listed flat, taking out the second under a name of its own rather than over the first, saying so', async () => {
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
            reason: strings.commander.keptUnmatched(at('twins.zip'), 2),
          },
          { type: 'done', stopped: false },
        ],
      );
      assert.deepStrictEqual([...treeOf(target).keys()].toSorted(), [
        'same.txt',
        'same_1.txt',
        'single.txt',
      ]);
      assert.deepStrictEqual(
        [...(await takenOut(at('twins.zip'))).keys()],
        ['one', 'one/same.txt', 'two', 'two/same.txt'],
      );
    });
  });
});

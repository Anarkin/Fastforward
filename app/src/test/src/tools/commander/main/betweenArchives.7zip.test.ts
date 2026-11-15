import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import {
  Archives,
  type OpenedArchive,
} from '../../../../../tools/commander/main/archives';
import type { PackPlan } from '../../../../../tools/commander/main/archiveReader';
import { copiedBetween } from '../../../../../tools/commander/main/betweenArchives';
import type { PackFormat } from '../../../../../tools/commander/shared/packing';
import { plainOf } from '../../../../../lib/shared/sentences';
import {
  reader,
  madeTree,
  rootItems,
  treeOf,
  writable,
  withoutDates,
  only,
  docsOrOld,
  sortedTree,
} from './roundTripFixtures';
import { removeFolder, tempFolder } from '../../../../helpers/tempFolders';

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
});

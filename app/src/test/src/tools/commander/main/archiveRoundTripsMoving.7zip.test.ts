import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import {
  Archives,
  type OpenedArchive,
  type PackPlan,
} from '../../../../../tools/commander/main/archives';
import type { ClashReply } from '../../../../../tools/commander/main/transfer';
import type { TransferEvent } from '../../../../../tools/commander/main/transferProtocol';
import { unpackingFirst } from '../../../../../tools/commander/main/unpacking';
import { copiedBetween } from '../../../../../tools/commander/main/betweenArchives';
import type { PackFormat } from '../../../../../tools/commander/shared/packing';
import { plainOf, strings } from '../../../../../lib/shared/strings';
import { removeFolder, tempFolder } from '../../../../helpers/repositories';
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
  sortedTree,
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

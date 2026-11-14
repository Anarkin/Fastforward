import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import type { Hashed } from '../../../../../tools/commander/main/contentHash';
import {
  Duplicates,
  type Compared,
  type ContentReader,
} from '../../../../../tools/commander/main/duplicates';

const head = 4;

interface Fake {
  readonly reader: ContentReader;
  readonly reads: string[];
  readonly held: Map<string, () => void>;
}

function fakeReader(
  contents: Record<string, string>,
  ids: Record<string, string | undefined> = {},
  holding: readonly string[] = [],
): Fake {
  const reads: string[] = [];
  const held = new Map<string, () => void>();
  const hashed = (file: string, bytes: number | undefined) => {
    const content = contents[file];
    return content === undefined
      ? undefined
      : {
          hash: bytes === undefined ? content : content.slice(0, bytes),
          id: Object.hasOwn(ids, file) ? ids[file] : file,
          size: content.length,
        };
  };
  const reader: ContentReader = {
    hash: (file, bytes, signal) => {
      reads.push(bytes === undefined ? file : `${file} start`);
      if (!holding.includes(file)) {
        return Promise.resolve(hashed(file, bytes));
      }
      return new Promise<Hashed | undefined>((resolve) => {
        held.set(file, () => resolve(hashed(file, bytes)));
        signal.addEventListener('abort', () => resolve(undefined));
      });
    },
  };
  return { reader, reads, held };
}

const compared = (
  contents: Record<string, string>,
  modified: Record<string, number> = {},
): Compared[] =>
  Object.entries(contents).map(([key, content]) => ({
    key,
    file: key,
    size: content.length,
    modified: modified[key] ?? 1,
  }));

const sorted = (groups: readonly (readonly string[])[]) =>
  groups
    .map((group) => [...group].toSorted())
    .toSorted((one, other) => one.join().localeCompare(other.join()));

async function found(
  contents: Record<string, string>,
  ids: Record<string, string | undefined> = {},
) {
  const fake = fakeReader(contents, ids);
  const duplicates = new Duplicates(fake.reader, () => {}, { head });
  duplicates.look(compared(contents));
  await duplicates.idle();
  return { groups: sorted(duplicates.groups), reads: fake.reads, duplicates };
}

suite('Duplicate files', () => {
  test('groups the files of the same content whatever their names, leaving out those of a size, a start or an end of their own', async () => {
    const { groups, reads } = await found({
      'a.txt': 'same content',
      'copy of a.txt': 'same content',
      'sub/e.txt': 'same content',
      'b.txt': 'samX content',
      'c.txt': 'same contenX',
      'd.txt': 'other',
    });

    assert.deepStrictEqual(groups, [['a.txt', 'copy of a.txt', 'sub/e.txt']]);
    assert.ok(!reads.some((read) => read.startsWith('d.txt')), String(reads));
    assert.ok(!reads.includes('b.txt'), String(reads));
  });

  test('reads only the start of a file no longer than it, as the start is all of it', async () => {
    const { groups, reads } = await found({ 'a.txt': 'abc', 'b.txt': 'abc' });

    assert.deepStrictEqual(groups, [['a.txt', 'b.txt']]);
    assert.deepStrictEqual(reads.toSorted(), ['a.txt start', 'b.txt start']);
  });

  test('takes hard links to one file for that file, showing it once, and makes no group of links to one file alone', async () => {
    const linked = await found(
      { 'a.txt': 'abcdef', 'link.txt': 'abcdef', 'copy.txt': 'abcdef' },
      { 'link.txt': 'a.txt' },
    );
    const alone = await found(
      { 'a.txt': 'abcdef', 'link.txt': 'abcdef' },
      { 'link.txt': 'a.txt' },
    );

    assert.deepStrictEqual(linked.groups, [['a.txt', 'copy.txt']]);
    assert.deepStrictEqual(alone.groups, []);
  });

  test('takes files whose drive tells no identity of them for files of their own, rather than for links to one file', async () => {
    const { groups } = await found(
      { 'a.txt': 'abcdef', 'copy.txt': 'abcdef', 'other.txt': 'abcdef' },
      { 'a.txt': undefined, 'copy.txt': undefined, 'other.txt': undefined },
    );

    assert.deepStrictEqual(groups, [['a.txt', 'copy.txt', 'other.txt']]);
  });

  test('leaves out empty files and the files it is told to skip, as files kept online only, without reading them', async () => {
    const fake = fakeReader({
      'a.txt': 'abcdef',
      'b.txt': 'abcdef',
      'online.txt': 'abcdef',
      'empty.txt': '',
      'none.txt': '',
    });
    const duplicates = new Duplicates(fake.reader, () => {}, {
      head,
      skip: (file) => Promise.resolve(file === 'online.txt'),
    });
    duplicates.look(
      compared({
        'a.txt': 'abcdef',
        'b.txt': 'abcdef',
        'online.txt': 'abcdef',
        'empty.txt': '',
        'none.txt': '',
      }),
    );
    await duplicates.idle();

    assert.deepStrictEqual(sorted(duplicates.groups), [['a.txt', 'b.txt']]);
    assert.ok(
      !fake.reads.some(
        (read) =>
          read.startsWith('online') ||
          read.startsWith('empty') ||
          read.startsWith('none'),
      ),
      String(fake.reads),
    );
  });

  test('leaves out a file it cannot read, and a group left with one file', async () => {
    const fake = fakeReader({ 'a.txt': 'abcdef', 'b.txt': 'abcdef' });
    const duplicates = new Duplicates(fake.reader, () => {}, { head });
    duplicates.look(
      compared({ 'a.txt': 'abcdef', 'b.txt': 'abcdef', 'gone.txt': 'abcdef' }),
    );
    await duplicates.idle();
    const two = sorted(duplicates.groups);
    duplicates.look(compared({ 'a.txt': 'abcdef', 'gone.txt': 'abcdef' }));
    await duplicates.idle();

    assert.deepStrictEqual(
      [two, duplicates.groups],
      [[['a.txt', 'b.txt']], []],
    );
  });

  test('reads no file again whose size and date are the same once given the files anew, as after a delete, and reads a file changed since', async () => {
    const contents = {
      'a.txt': 'abcdef',
      'b.txt': 'abcdef',
      'c.txt': 'abcdef',
    };
    const fake = fakeReader(contents);
    const duplicates = new Duplicates(fake.reader, () => {}, { head });
    duplicates.look(compared(contents));
    await duplicates.idle();
    fake.reads.length = 0;

    duplicates.look(compared({ 'a.txt': 'abcdef', 'b.txt': 'abcdef' }));
    await duplicates.idle();
    const afterDelete = {
      groups: sorted(duplicates.groups),
      reads: [...fake.reads],
    };
    duplicates.look(
      compared({ 'a.txt': 'abcdef', 'b.txt': 'abcdef' }, { 'b.txt': 2 }),
    );
    await duplicates.idle();

    assert.deepStrictEqual(afterDelete, {
      groups: [['a.txt', 'b.txt']],
      reads: [],
    });
    assert.deepStrictEqual(fake.reads.toSorted(), ['b.txt', 'b.txt start']);
  });

  test('reads every file again once told to forget what it read, as F2 asks', async () => {
    const contents = { 'a.txt': 'abc', 'b.txt': 'abc' };
    const fake = fakeReader(contents);
    const duplicates = new Duplicates(fake.reader, () => {}, { head });
    duplicates.look(compared(contents));
    await duplicates.idle();
    fake.reads.length = 0;

    duplicates.forget();
    duplicates.look(compared(contents));
    await duplicates.idle();

    assert.deepStrictEqual(fake.reads.toSorted(), [
      'a.txt start',
      'b.txt start',
    ]);
  });

  test('says it reads until every group is known, telling of each group found, and stops on stop, keeping the groups found so far', async () => {
    const contents = {
      'a.txt': 'abc',
      'b.txt': 'abc',
      'c.txt': 'abcdefgh',
      'd.txt': 'abcdefgh',
    };
    const fake = fakeReader(contents, {}, ['d.txt']);
    let told = 0;
    const duplicates = new Duplicates(fake.reader, () => told++, { head });
    duplicates.look(compared(contents));
    await new Promise((resolve) => setTimeout(resolve, 0));
    const before = {
      reading: duplicates.reading,
      groups: sorted(duplicates.groups),
      told: told > 0,
    };

    duplicates.stop();
    await duplicates.idle();

    assert.deepStrictEqual(before, {
      reading: true,
      groups: [['a.txt', 'b.txt']],
      told: true,
    });
    assert.deepStrictEqual(
      [duplicates.reading, sorted(duplicates.groups)],
      [false, [['a.txt', 'b.txt']]],
    );
  });

  test('reads nothing more once closed', async () => {
    const contents = { 'a.txt': 'abc', 'b.txt': 'abc' };
    const fake = fakeReader(contents, {}, ['a.txt', 'b.txt']);
    const duplicates = new Duplicates(fake.reader, () => {}, { head });
    duplicates.look(compared(contents));
    duplicates.close();
    await duplicates.idle();

    assert.deepStrictEqual(
      [duplicates.reading, duplicates.groups],
      [false, []],
    );
  });
});

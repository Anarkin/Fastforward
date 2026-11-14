import * as assert from 'node:assert';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import {
  walkFolders,
  type SizeRead,
  type SizeWalked,
} from '../../../../../tools/commander/main/sizeWalk';

const root = path.resolve('/', 'Downloads');
const at = (...names: string[]) => path.join(root, ...names);

function walked(
  rest: readonly string[] = [],
  more: Partial<SizeWalked> = {},
): SizeWalked {
  return { bytes: 0, unread: 0, unreadable: false, rest, ...more };
}

function clocked(
  found: Record<string, SizeRead | undefined>,
  millisEach: number,
) {
  let clock = 0;
  const read: string[] = [];
  return {
    read,
    reader: (each: string) => {
      read.push(each);
      clock += millisEach;
      return found[each];
    },
    now: () => clock,
  };
}

suite('A walk of folders', () => {
  test('reads folders, those under each first, until its time is up, telling the bytes and the folders it did not reach', async () => {
    const { read, reader, now } = clocked(
      {
        [at('a')]: { bytes: 1, folders: [at('a', 'x'), at('a', 'y')] },
        [at('a', 'x')]: { bytes: 2, folders: [] },
        [at('a', 'y')]: { bytes: 4, folders: [] },
        [at('b')]: { bytes: 8, folders: [] },
      },
      10,
    );

    const result = await walkFolders(
      { folders: [at('a'), at('b')], asked: false },
      reader,
      25,
      undefined,
      now,
    );

    assert.deepStrictEqual(read, [at('a'), at('a', 'x'), at('a', 'y')]);
    assert.deepStrictEqual(result, {
      bytes: 7,
      unread: 0,
      unreadable: false,
      rest: [at('b')],
    });
  });

  test('reads one folder at least, however little time it has', async () => {
    const { read, reader, now } = clocked(
      { [at('a')]: { bytes: 1, folders: [at('a', 'x')] } },
      10,
    );

    const result = await walkFolders(
      { folders: [at('a')], asked: true },
      reader,
      0,
      undefined,
      now,
    );

    assert.deepStrictEqual(read, [at('a')]);
    assert.deepStrictEqual(result.rest, [at('a', 'x')]);
  });

  test('tells a folder asked for that it could not read apart from the folders under one it could not read', async () => {
    const { reader, now } = clocked(
      { [at('a')]: { bytes: 1, folders: [at('a', 'locked')] } },
      1,
    );

    assert.deepStrictEqual(
      await walkFolders(
        { folders: [at('secret')], asked: true },
        reader,
        100,
        undefined,
        now,
      ),
      walked([], { unreadable: true }),
    );
    assert.deepStrictEqual(
      await walkFolders(
        { folders: [at('a')], asked: true },
        reader,
        100,
        undefined,
        now,
      ),
      walked([], { bytes: 1, unread: 1 }),
    );
  });

  test('reads no further folder once it is stopped', async () => {
    const stopping = new AbortController();
    const { read, now } = clocked({}, 1);

    const result = await walkFolders(
      { folders: [at('a'), at('b')], asked: false },
      (each) => {
        read.push(each);
        stopping.abort();
        return { bytes: 1, folders: [] };
      },
      100,
      stopping.signal,
      now,
    );

    assert.deepStrictEqual(read, [at('a')]);
    assert.deepStrictEqual(result.rest, [at('b')]);
  });
});

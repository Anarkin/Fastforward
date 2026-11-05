import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { filesToCompare } from '../../../../tools/commander/page/comparing';
import type { PaneView } from '../../../../tools/commander/page/view';
import type { Entry } from '../../../../tools/commander/shared/protocol';

const entry = (name: string, folder = false): Entry => ({
  name,
  folder,
  link: false,
  hidden: false,
  size: 0,
  modified: 0,
});

const pane = (
  names: readonly string[],
  selected: string | undefined,
  marked: readonly string[] = [],
): PaneView => {
  const entries = names.map((name) => entry(name, name.endsWith('/')));
  return {
    folder: '/f',
    entries,
    parent: true,
    back: false,
    forward: false,
    elevated: false,
    hidden: [],
    sort: { column: 'extension', descending: false, groupByColor: false },
    rows: [
      {
        key: '..',
        entry: undefined,
        base: '..',
        extension: '',
        repository: false,
      },
      ...entries.map((each) => ({
        key: each.name,
        entry: each,
        base: each.name,
        extension: '',
        repository: false,
      })),
    ],
    selected,
    marked: new Set(marked),
    repositories: new Set(),
  };
};

suite('The files to compare', () => {
  test('compares the file under the cursor of each side, the left the old one', () => {
    assert.deepStrictEqual(
      filesToCompare('right', {
        left: pane(['a.txt', 'b.txt'], 'a.txt'),
        right: pane(['c.txt'], 'c.txt'),
      }),
      [
        { side: 'left', name: 'a.txt' },
        { side: 'right', name: 'c.txt' },
      ],
    );
  });

  test('prefers the one file marked on a side to its cursor', () => {
    assert.deepStrictEqual(
      filesToCompare('left', {
        left: pane(['a.txt', 'b.txt'], 'a.txt', ['b.txt']),
        right: pane(['c.txt', 'd.txt'], 'c.txt', ['c.txt', 'd.txt']),
      }),
      [
        { side: 'left', name: 'b.txt' },
        { side: 'right', name: 'c.txt' },
      ],
    );
  });

  test('compares the two files marked on the active side, in the order listed', () => {
    assert.deepStrictEqual(
      filesToCompare('right', {
        left: pane(['a.txt'], 'a.txt'),
        right: pane(['c.txt', 'd.txt'], 'c.txt', ['d.txt', 'c.txt']),
      }),
      [
        { side: 'right', name: 'c.txt' },
        { side: 'right', name: 'd.txt' },
      ],
    );
  });

  test('compares nothing when a side has no file to give, as a folder or the parent row', () => {
    assert.strictEqual(
      filesToCompare('left', {
        left: pane(['sub/', 'a.txt'], 'sub/'),
        right: pane(['c.txt'], 'c.txt'),
      }),
      undefined,
    );
    assert.strictEqual(
      filesToCompare('left', {
        left: pane(['a.txt'], '..'),
        right: pane(['c.txt'], 'c.txt'),
      }),
      undefined,
    );
    assert.strictEqual(
      filesToCompare('left', {
        left: undefined,
        right: pane(['c.txt'], 'c.txt'),
      }),
      undefined,
    );
  });
});

import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { strings } from '../../../../../lib/shared/strings';
import {
  changesTree,
  changesTreeRows,
} from '../../../../../tools/git/page/changesRows';
import {
  fileRowLook,
  type RowShown,
} from '../../../../../tools/git/page/fileRowLooks';
import { filesRows } from '../../../../../tools/git/page/filesRows';
import { fileChange } from '../../../../helpers/gitValues';

const rowsOf = (paths: readonly string[], all: readonly string[] = []) =>
  filesRows([
    {
      area: undefined,
      header: true,
      rows: changesTreeRows(
        changesTree(
          paths.map((path) => fileChange(path)),
          all,
        ),
        new Set(),
        new Set(['docs']),
      ),
    },
  ]);

const looksOf = (
  paths: readonly string[],
  shown: Partial<RowShown> = {},
  all: readonly string[] = [],
) =>
  rowsOf(paths, all).map((row) =>
    fileRowLook(row, {
      cursor: undefined,
      showsAll: false,
      root: '/repo',
      ...shown,
    }),
  );

const named = (showsAll: boolean, name: string) =>
  looksOf(['src/a.ts'], { showsAll }, ['src/a.ts', 'docs/b.md']).find(
    (look) => look.kind !== 'header' && look.name === name,
  );

suite('Looks of the rows of the files', () => {
  test('heads the changes with All Changes, then the folders and the files at their depth, each found in the folder of the worktree it is in', () => {
    assert.deepStrictEqual(
      looksOf(['src/lib/a.ts', 'b.ts'], { root: 'C:\\repo' }).map((look) =>
        look.kind === 'header'
          ? [look.kind, look.text]
          : [look.kind, look.name, look.depth, look.root],
      ),
      [
        ['header', strings.files.allChanges],
        ['folder', 'src/lib', 0, 'C:\\repo'],
        ['file', 'a.ts', 1, 'C:\\repo\\src\\lib'],
        ['file', 'b.ts', 0, 'C:\\repo'],
      ],
    );
  });

  test('marks the row under the cursor, whatever its kind, and no other', () => {
    for (const cursor of ['changes', 'folder:src', 'file:src/a.ts']) {
      assert.deepStrictEqual(
        looksOf(['src/a.ts'], { cursor }).flatMap((look) =>
          look.selected ? [look.key] : [],
        ),
        [cursor],
      );
    }
  });

  test('dims a folder without changes only while all files show, and keeps the change of a file for its mark', () => {
    const docs = named(true, 'docs');
    assert.ok(docs?.kind === 'folder' && docs.dimmed);
    const src = named(true, 'src');
    assert.ok(src?.kind === 'folder' && !src.dimmed);
    const changed = named(true, 'a.ts');
    assert.strictEqual(
      changed?.kind === 'file' ? changed.change?.path : undefined,
      'src/a.ts',
    );
    const unchanged = named(true, 'b.md');
    assert.ok(unchanged?.kind === 'file' && unchanged.change === undefined);
  });
});

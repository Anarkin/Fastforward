import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { gitKeymap } from '../../../../../tools/git/page/keymap';
import {
  changesTree,
  changesTreeRows,
  type ChangesTreeRow,
} from '../../../../../tools/git/page/changesRows';
import {
  filesAncestors,
  filesKey,
  filesRows,
  filesTreeItem,
  listedFilesRows,
} from '../../../../../tools/git/page/filesRows';
import { listMoveOf } from '../../../../../lib/page/listMoves';
import { keyPressed } from '../../../../../lib/page/shortcuts';
import { files } from './changesRowsFixtures';
import { fileChange } from '../../../../helpers/gitValues';
import { keyPress } from '../../../../helpers/keys';

suite('Changes tree', () => {
  test('keys the rows the same while they stay the same, so the list keeps their sizes', () => {
    const tree = changesTreeRows(changesTree(files), new Set(['src']));
    const section = (header: boolean) =>
      filesRows([{ area: undefined, header, rows: tree }]);
    const rows = section(true);
    const listed = listedFilesRows(rows);
    assert.strictEqual(listedFilesRows(rows), listed);
    assert.deepStrictEqual(
      Array.from({ length: listed.count }, (_, index) => listed.keyOf(index)),
      [
        'changes',
        'folder:src',
        'folder:tests/Gyurma.Tests',
        'file:tests/Gyurma.Tests/SignatureTests.cs',
        'file:.editorconfig',
      ],
    );
    assert.strictEqual(listed.indexOf('file:.editorconfig'), 4);
    assert.strictEqual(listed.indexOf('file:src/Gyurma/MethodSetup.cs'), -1);
    assert.strictEqual(
      listedFilesRows(section(false)).indexOf('folder:src'),
      0,
    );
  });
});

const visible = { first: 0, last: 0 };

const at = (path: string) => ({ area: undefined, path });

const tree = (paths: string[]) =>
  changesTreeRows(
    changesTree(paths.map((path) => fileChange(path))),
    new Set(),
  );

suite('Files column keys', () => {
  const columnFiles = [
    fileChange('src/app/a.ts'),
    fileChange('src/b.ts'),
    fileChange('c.ts'),
  ];
  const rows = (closed: string[] = []) =>
    filesRows([
      {
        area: undefined,
        header: true,
        rows: changesTreeRows(changesTree(columnFiles), new Set(closed)),
      },
    ]);
  const none = { area: undefined, path: undefined };

  test('moves through All Changes, the folders and the files, selecting the files it lands on', () => {
    assert.deepStrictEqual(filesKey('down', rows(), 'changes', none, visible), {
      kind: 'cursor',
      key: 'folder:src',
    });
    assert.deepStrictEqual(filesKey('last', rows(), 'changes', none, visible), {
      kind: 'select',
      key: 'file:c.ts',
      area: undefined,
      file: 'c.ts',
    });
    assert.deepStrictEqual(
      filesKey('first', rows(), 'file:c.ts', at('c.ts'), visible),
      { kind: 'select', key: 'changes', area: undefined, file: undefined },
    );
    assert.deepStrictEqual(filesKey('up', rows(), 'changes', none, visible), {
      kind: 'stay',
    });
  });

  test('selects the file or All Changes it lands on only when it is not selected already, so the diff is not loaded anew', () => {
    assert.deepStrictEqual(
      filesKey('down', rows(), 'folder:src/app', at('src/app/a.ts'), visible),
      { kind: 'cursor', key: 'file:src/app/a.ts' },
    );
    assert.deepStrictEqual(
      filesKey('down', rows(), 'folder:src/app', at('src/b.ts'), visible),
      {
        kind: 'select',
        key: 'file:src/app/a.ts',
        area: undefined,
        file: 'src/app/a.ts',
      },
    );
    assert.deepStrictEqual(
      filesKey('up', rows(), 'folder:src', none, visible),
      { kind: 'cursor', key: 'changes' },
    );
  });

  test('opens or closes the folder under the cursor on Space, doing nothing else on a file', () => {
    assert.deepStrictEqual(
      filesKey('folder', rows(['src']), 'folder:src', none, visible),
      { kind: 'toggle', area: undefined, folder: 'src', changed: true },
    );
    assert.deepStrictEqual(
      filesKey('folder', rows(), 'folder:src/app', none, visible),
      { kind: 'toggle', area: undefined, folder: 'src/app', changed: true },
    );
    assert.deepStrictEqual(
      filesKey('folder', rows(), 'file:c.ts', at('c.ts'), visible),
      { kind: 'stay' },
    );
  });

  test('moves from All Changes into the staged changes and on into the unstaged ones, keying a file in both apart and its folders by their side', () => {
    const sections = filesRows([
      { area: undefined, header: true, rows: [] },
      { area: 'staged', header: true, rows: tree(['a.ts']) },
      { area: 'unstaged', header: true, rows: tree(['a.ts', 'src/b.ts']) },
    ]);
    const listed = listedFilesRows(sections);
    assert.deepStrictEqual(
      filesKey('down', sections, 'changes', none, visible),
      {
        kind: 'select',
        key: 'staged:changes',
        area: 'staged',
        file: undefined,
      },
    );
    assert.deepStrictEqual(
      filesKey(
        'first',
        sections,
        'unstaged:file:a.ts',
        { area: 'unstaged', path: 'a.ts' },
        visible,
      ),
      { kind: 'select', key: 'changes', area: undefined, file: undefined },
    );
    assert.deepStrictEqual(
      Array.from({ length: listed.count }, (_, index) => listed.keyOf(index)),
      [
        'changes',
        'staged:changes',
        'staged:file:a.ts',
        'unstaged:changes',
        'unstaged:folder:src',
        'unstaged:file:src/b.ts',
        'unstaged:file:a.ts',
      ],
    );
    assert.deepStrictEqual(
      filesKey(
        'down',
        sections,
        'staged:file:a.ts',
        { area: 'staged', path: 'a.ts' },
        visible,
      ),
      {
        kind: 'select',
        key: 'unstaged:changes',
        area: 'unstaged',
        file: undefined,
      },
    );
    assert.deepStrictEqual(
      filesKey(
        'last',
        sections,
        'staged:changes',
        { area: 'staged', path: undefined },
        visible,
      ),
      {
        kind: 'select',
        key: 'unstaged:file:a.ts',
        area: 'unstaged',
        file: 'a.ts',
      },
    );
    assert.deepStrictEqual(
      filesKey(
        'folder',
        sections,
        'unstaged:folder:src',
        { area: 'staged', path: undefined },
        visible,
      ),
      { kind: 'toggle', area: 'unstaged', folder: 'src', changed: true },
    );
    assert.deepStrictEqual(filesAncestors(sections, 5), [4]);
  });

  test('leaves Left and Right to moving between the columns', () => {
    for (const key of ['ArrowLeft', 'ArrowRight']) {
      assert.strictEqual(listMoveOf(keyPress(key)), undefined);
      assert.strictEqual(
        keyPressed(gitKeymap.folder, keyPress(key)),
        undefined,
      );
    }
  });
});

suite('Files tree for assistive technology', () => {
  const folder: ChangesTreeRow = {
    kind: 'folder',
    name: 'a',
    path: 'a',
    depth: 0,
    open: true,
    changed: true,
  };
  const closed: ChangesTreeRow = { ...folder, path: 'c', open: false };
  const file: ChangesTreeRow = {
    kind: 'file',
    name: 'b',
    path: 'a/b',
    change: undefined,
    depth: 1,
  };

  test('tells how deep each row lies, under the header of its side when it has one, and whether a folder is open', () => {
    const sides = filesRows([
      { area: 'staged', header: true, rows: [folder, file] },
      { area: 'unstaged', header: true, rows: [closed] },
    ]);
    assert.deepStrictEqual(
      sides.map((_, index) => filesTreeItem(sides, index)),
      [
        { level: 1 },
        { level: 2, expanded: true },
        { level: 3 },
        { level: 1 },
        { level: 2, expanded: false },
      ],
    );
    const alone = filesRows([
      { area: undefined, header: false, rows: [folder, file] },
    ]);
    assert.deepStrictEqual(
      alone.map((_, index) => filesTreeItem(alone, index)),
      [{ level: 1, expanded: true }, { level: 2 }],
    );
  });
});

import * as assert from 'node:assert';
import { buildFileTree, fileTreeRows, foldersOf } from '../webview/fileTree';
import { fileChange } from './fixtures';

suite('File tree', () => {
  test('nests files in folders and marks the ones with changes', () => {
    const tree = buildFileTree(
      ['README.md', 'src/a.ts', 'src/lib/b.ts', 'docs/c.md'],
      new Map([['src/lib/b.ts', fileChange('src/lib/b.ts', { status: 'M' })]]),
    );
    assert.deepStrictEqual(
      tree.files.map((file) => file.path),
      ['README.md'],
    );
    const src = tree.folders.get('src');
    assert.ok(src?.changed);
    assert.deepStrictEqual(
      src.files.map((file) => file.path),
      ['src/a.ts'],
    );
    assert.ok(src.folders.get('lib')?.changed);
    assert.deepStrictEqual(
      src.folders.get('lib')?.files.map((file) => file.path),
      ['src/lib/b.ts'],
    );
    assert.ok(!tree.folders.get('docs')?.changed);
  });

  test('includes files the commit deleted', () => {
    const tree = buildFileTree(
      ['a.ts'],
      new Map([['gone.ts', fileChange('gone.ts', { status: 'D' })]]),
    );
    assert.deepStrictEqual(tree.files.map((file) => file.path).toSorted(), [
      'a.ts',
      'gone.ts',
    ]);
  });

  test('lists the folders a path is in', () => {
    assert.deepStrictEqual(foldersOf('src/lib/b.ts'), ['src', 'src/lib']);
    assert.deepStrictEqual(foldersOf('README.md'), []);
    assert.deepStrictEqual(foldersOf('vendor/lib/'), ['vendor']);
  });

  test('lists folders first, both by name, and marks the changed ones', () => {
    const tree = buildFileTree(
      ['b.ts', 'a.ts', 'src/x.ts', 'lib/y.ts', 'lib/deep/z.ts'],
      new Map([['src/x.ts', fileChange('src/x.ts')]]),
    );
    assert.deepStrictEqual(
      fileTreeRows(tree, new Set(['lib', 'lib/deep', 'src'])).map((row) =>
        row.kind === 'folder'
          ? `${row.depth} ${row.open ? '▾' : '▸'} ${row.path}${row.changed ? ' *' : ''}`
          : `${row.depth} ${row.path}`,
      ),
      [
        '0 ▾ lib',
        '1 ▾ lib/deep',
        '2 lib/deep/z.ts',
        '1 lib/y.ts',
        '0 ▾ src *',
        '1 src/x.ts',
        '0 a.ts',
        '0 b.ts',
      ],
    );
  });

  test('leaves out the contents of a closed folder', () => {
    const tree = buildFileTree(['src/x.ts', 'a.ts'], new Map());
    assert.deepStrictEqual(fileTreeRows(tree, new Set()), [
      {
        kind: 'folder',
        name: 'src',
        path: 'src',
        depth: 0,
        open: false,
        changed: false,
      },
      { kind: 'file', name: 'a.ts', path: 'a.ts', depth: 0 },
    ]);
  });
});

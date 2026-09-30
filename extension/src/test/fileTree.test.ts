import * as assert from 'node:assert';
import { buildFileTree, foldersOf } from '../webview/fileTree';
import { fileChange } from './fixtures';

suite('file tree', () => {
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
});

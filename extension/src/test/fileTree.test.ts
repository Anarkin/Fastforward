import * as assert from 'node:assert';
import type { FileChange } from '../protocol';
import { buildFileTree, foldersOf } from '../webview/fileTree';

function change(path: string, status: FileChange['status']): FileChange {
  return { path, oldPath: undefined, status, insertions: 0, deletions: 0 };
}

suite('file tree', () => {
  test('nests files in folders and marks the ones with changes', () => {
    const tree = buildFileTree(
      ['README.md', 'src/a.ts', 'src/lib/b.ts', 'docs/c.md'],
      new Map([['src/lib/b.ts', change('src/lib/b.ts', 'M')]]),
    );
    assert.deepStrictEqual(
      tree.files.map((file) => file.path),
      ['README.md'],
    );
    const src = tree.folders.get('src');
    assert.ok(src?.changed);
    assert.ok(src.folders.get('lib')?.changed);
    assert.ok(!tree.folders.get('docs')?.changed);
  });

  test('includes files the commit deleted', () => {
    const tree = buildFileTree(
      ['a.ts'],
      new Map([['gone.ts', change('gone.ts', 'D')]]),
    );
    assert.deepStrictEqual(tree.files.map((file) => file.path).toSorted(), [
      'a.ts',
      'gone.ts',
    ]);
  });

  test('lists the folders a path is in', () => {
    assert.deepStrictEqual(foldersOf('src/lib/b.ts'), ['src', 'src/lib']);
    assert.deepStrictEqual(foldersOf('README.md'), []);
  });
});

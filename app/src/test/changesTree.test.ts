import * as assert from 'node:assert';
import {
  ancestorRows,
  changesTree,
  changesTreeRows,
  treeFolders,
} from '../webview/changesTree';
import { fileChange } from './fixtures';

const files = [
  '.editorconfig',
  'src/Gyurma/MethodSetup.cs',
  'src/Gyurma.Generators/GyurmaGenerator.cs',
  'src/Gyurma/VoidMethodSetup.cs',
  'tests/Gyurma.Tests/SignatureTests.cs',
].map((path) => fileChange(path));

const lines = (rows: ReturnType<typeof changesTreeRows>) =>
  rows.map((row) =>
    row.kind === 'folder'
      ? `${'  '.repeat(row.depth)}${row.open ? '▾' : '▸'} ${row.name}`
      : `${'  '.repeat(row.depth)}${row.name}`,
  );

suite('Changes tree', () => {
  test('lists folders first, merging single-folder ones', () => {
    assert.deepStrictEqual(
      lines(changesTreeRows(changesTree(files), new Set())),
      [
        '▾ src',
        '  ▾ Gyurma',
        '    MethodSetup.cs',
        '    VoidMethodSetup.cs',
        '  ▾ Gyurma.Generators',
        '    GyurmaGenerator.cs',
        '▾ tests/Gyurma.Tests',
        '  SignatureTests.cs',
        '.editorconfig',
      ],
    );
  });

  test('lists an untracked nested repository by its name', () => {
    const nested = [fileChange('vendor/lib/', { status: 'U' })];
    assert.deepStrictEqual(
      lines(changesTreeRows(changesTree(nested), new Set())),
      ['▾ vendor', '  lib/'],
    );
  });

  test('hides what is in a closed folder', () => {
    const rows = changesTreeRows(
      changesTree(files),
      new Set(['src', 'tests/Gyurma.Tests']),
    );
    assert.deepStrictEqual(lines(rows), [
      '▸ src',
      '▸ tests/Gyurma.Tests',
      '.editorconfig',
    ]);
  });

  test('adds the unchanged files, keeping the folders without changes closed until opened', () => {
    const changed = [fileChange('src/a.ts')];
    const all = ['src/a.ts', 'src/b.ts', 'docs/c.md', 'README.md'];
    assert.deepStrictEqual(
      lines(changesTreeRows(changesTree(changed, all), new Set())),
      ['▸ docs', '▾ src', '  a.ts', '  b.ts', 'README.md'],
    );
    assert.deepStrictEqual(
      lines(
        changesTreeRows(
          changesTree(changed, all),
          new Set(['src']),
          new Set(['docs']),
        ),
      ),
      ['▾ docs', '  c.md', '▸ src', 'README.md'],
    );
  });

  test('marks which folders and files hold changes', () => {
    const rows = changesTreeRows(
      changesTree(
        [fileChange('src/a.ts')],
        ['src/a.ts', 'src/b.ts', 'docs/c.md'],
      ),
      new Set(),
      new Set(['docs']),
    );
    assert.deepStrictEqual(
      rows.map((row) =>
        row.kind === 'folder'
          ? `${row.path} ${row.changed ? 'changed' : 'unchanged'}`
          : `${row.path} ${row.change ? 'changed' : 'unchanged'}`,
      ),
      [
        'docs unchanged',
        'docs/c.md unchanged',
        'src changed',
        'src/a.ts changed',
        'src/b.ts unchanged',
      ],
    );
  });

  test('finds the folders a row is in, outermost first', () => {
    const rows = changesTreeRows(changesTree(files), new Set());
    const at = (text: string) => lines(rows).indexOf(text);
    assert.deepStrictEqual(ancestorRows(rows, at('    VoidMethodSetup.cs')), [
      at('▾ src'),
      at('  ▾ Gyurma'),
    ]);
    assert.deepStrictEqual(ancestorRows(rows, at('  ▾ Gyurma.Generators')), [
      at('▾ src'),
    ]);
    assert.deepStrictEqual(ancestorRows(rows, at('.editorconfig')), []);
  });

  test('lists the folders of a tree built once, opening and closing them without building it again', () => {
    const tree = changesTree(files);
    assert.deepStrictEqual(lines(changesTreeRows(tree, new Set(['src']))), [
      '▸ src',
      '▾ tests/Gyurma.Tests',
      '  SignatureTests.cs',
      '.editorconfig',
    ]);
    assert.deepStrictEqual(lines(changesTreeRows(tree, new Set())), [
      '▾ src',
      '  ▾ Gyurma',
      '    MethodSetup.cs',
      '    VoidMethodSetup.cs',
      '  ▾ Gyurma.Generators',
      '    GyurmaGenerator.cs',
      '▾ tests/Gyurma.Tests',
      '  SignatureTests.cs',
      '.editorconfig',
    ]);
  });

  test('lists every folder of the tree by whether it holds changes', () => {
    const tree = changesTree(
      [fileChange('src/lib/a.ts')],
      ['src/lib/a.ts', 'src/b.ts', 'docs/api/c.md', 'docs/api/d.md'],
    );
    assert.deepStrictEqual(treeFolders(tree), {
      changed: ['src', 'src/lib'],
      unchanged: ['docs/api'],
    });
  });

  test('finds the folders of a row in a large folder without reading the rows before it', () => {
    const tree = changesTree(
      Array.from({ length: 10_000 }, (_, i) => fileChange(`src/lib/${i}.ts`)),
      ['src/a.ts'],
    );
    const listed = changesTreeRows(tree, new Set());
    ancestorRows(listed, 0);
    let reads = 0;
    const counted = new Proxy(listed, {
      get(target, key, receiver) {
        if (typeof key === 'string' && /^\d+$/.test(key)) {
          reads++;
        }
        return Reflect.get(target, key, receiver) as unknown;
      },
    });
    ancestorRows(counted, 0);
    reads = 0;
    assert.deepStrictEqual(ancestorRows(counted, listed.length - 2), [0, 1]);
    assert.ok(reads < 100, `${reads} reads`);
  });
});

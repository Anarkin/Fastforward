import * as assert from 'node:assert';
import { changesTreeRows } from '../webview/changesTree';
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
    assert.deepStrictEqual(lines(changesTreeRows(files, new Set())), [
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

  test('lists an untracked nested repository by its name', () => {
    const nested = [fileChange('vendor/lib/', { status: 'U' })];
    assert.deepStrictEqual(lines(changesTreeRows(nested, new Set())), [
      '▾ vendor',
      '  lib/',
    ]);
  });

  test('hides what is in a closed folder', () => {
    const rows = changesTreeRows(files, new Set(['src', 'tests/Gyurma.Tests']));
    assert.deepStrictEqual(lines(rows), [
      '▸ src',
      '▸ tests/Gyurma.Tests',
      '.editorconfig',
    ]);
  });
});

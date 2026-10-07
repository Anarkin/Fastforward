import * as assert from 'node:assert';
import { isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { keymap } from '../../shared/keymap';
import {
  ancestorRows,
  changesTree,
  changesTreeElement,
  changesTreeRows,
  filesAncestors,
  filesKey,
  filesRows,
  folderRowKey,
  listedFilesRows,
  treeFolders,
  type ChangesTreeRow,
} from '../../webview/changesTree';
import { listMoveOf } from '../../webview/listMoves';
import { keyPressed } from '../../webview/shortcuts';
import { fileRowKey } from '../../webview/tree';
import { clickFile } from '../componentFixtures';
import {
  classesOf,
  countingReads,
  fileChange,
  keyPress,
  noop,
  tagsWith,
  tagWith,
} from '../fixtures';

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

  test('lists the folders of the rows of a large folder once, then finds those of a row without reading the rows before it', () => {
    const tree = changesTree(
      Array.from({ length: 10_000 }, (_, i) => fileChange(`src/lib/${i}.ts`)),
      ['src/a.ts'],
    );
    const listed = changesTreeRows(tree, new Set());
    const rows = countingReads(listed);
    ancestorRows(rows.counted, 0);
    rows.reads = 0;
    assert.deepStrictEqual(
      ancestorRows(rows.counted, listed.length - 2),
      [0, 1],
    );
    assert.ok(rows.reads < 100, `${rows.reads} reads`);
  });

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

  test('moves from the staged changes on into the unstaged ones, keying a file in both apart and its folders by their side', () => {
    const sections = filesRows([
      { area: 'staged', header: true, rows: tree(['a.ts']) },
      { area: 'unstaged', header: true, rows: tree(['a.ts', 'src/b.ts']) },
    ]);
    const listed = listedFilesRows(sections);
    assert.deepStrictEqual(
      Array.from({ length: listed.count }, (_, index) => listed.keyOf(index)),
      [
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
    assert.deepStrictEqual(filesAncestors(sections, 4), [3]);
  });

  test('leaves Left and Right to moving between the columns', () => {
    for (const key of ['ArrowLeft', 'ArrowRight']) {
      assert.strictEqual(listMoveOf(keyPress(key)), undefined);
      assert.strictEqual(keyPressed(keymap.folder, keyPress(key)), undefined);
    }
  });
});

const changesTreeElements = ({
  rows,
  ...options
}: { rows: readonly ChangesTreeRow[] } & Parameters<
  typeof changesTreeElement
>[1]) => rows.map((row) => changesTreeElement(row, options));

suite('Changes tree rows', () => {
  test('draws folders and files, marking the selected file', () => {
    const changes = [fileChange('src/a.ts'), fileChange('src/b.ts')];
    const html = renderToStaticMarkup(
      <>
        {changesTreeElements({
          rows: changesTreeRows(changesTree(changes), new Set()),
          showsAll: false,
          onToggle: noop,
          selected: 'src/b.ts',
          onSelect: noop,
          cursor: fileRowKey('src/b.ts'),
        })}
      </>,
    );
    tagWith(html, 'title="src"', 'row', 'tree-row', 'folder', 'dimmed');
    tagWith(html, 'title="Modified: src/b.ts"', 'row', 'file', 'selected');
    const a = tagWith(html, 'title="Modified: src/a.ts"', 'row', 'file');
    assert.ok(!classesOf(a).has('selected'));
  });

  test('marks the row under the cursor, still deselecting the selected file on a click', () => {
    const picked: (string | undefined)[] = [];
    const elements = changesTreeElements({
      rows: changesTreeRows(changesTree([fileChange('src/a.ts')]), new Set()),
      showsAll: false,
      onToggle: noop,
      selected: 'src/a.ts',
      onSelect: (path) => picked.push(path),
      cursor: folderRowKey('src'),
    });
    const html = renderToStaticMarkup(<>{elements}</>);
    tagWith(html, 'title="src"', 'row', 'folder', 'selected');
    const a = tagWith(html, 'title="Modified: src/a.ts"', 'row', 'file');
    assert.ok(!classesOf(a).has('selected'));
    clickFile(elements[1]);
    assert.deepStrictEqual(picked, [undefined]);
  });

  test('showing all files, dims the folders and files without changes, and toggles each kind of folder its own way', () => {
    const toggled: string[] = [];
    const elements = changesTreeElements({
      rows: changesTreeRows(
        changesTree(
          [fileChange('src/lib/a.ts')],
          ['src/lib/a.ts', 'src/b.ts', 'docs/c.md'],
        ),
        new Set(),
        new Set(['docs']),
      ),
      showsAll: true,
      onToggle: (folder, changed) => toggled.push(`${folder} ${changed}`),
      selected: undefined,
      onSelect: noop,
      cursor: undefined,
    });
    const html = renderToStaticMarkup(<>{elements}</>);
    for (const title of ['src', 'src/lib']) {
      const row = tagWith(html, `title="${title}"`, 'row', 'folder');
      assert.ok(!classesOf(row).has('dimmed'), title);
    }
    tagWith(html, 'title="docs"', 'row', 'folder', 'dimmed');
    assert.strictEqual(tagsWith(html, 'path', 'unchanged').length, 2);
    for (const element of elements) {
      if (
        isValidElement<{ onToggle?: (folder: string) => void; path: string }>(
          element,
        )
      ) {
        element.props.onToggle?.(element.props.path);
      }
    }
    assert.deepStrictEqual(toggled, ['docs false', 'src true', 'src/lib true']);
  });
});

import * as assert from 'node:assert';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import type { FileChange } from '../../../../tools/git/shared/protocol';
import { twistyWidth } from '../../../../lib/page/treeLayout';
import { FileRow, FolderRow } from '../../../../lib/page/tree';
import { noop } from '../../../helpers/fixtures';
import { fileChange as change } from '../../../helpers/gitValues';
import { stylesheetPx } from '../../../helpers/pageSources';
import { tagWith } from '../../../helpers/markup';
import { knownWith, PathLooksContext } from '../../../../lib/page/pathLooks';
import { fileColorsOf } from '../../../../lib/page/fileColors';

suite('Tree', () => {
  test('draws the twisty as wide as a level of the tree is indented', () => {
    assert.strictEqual(
      stylesheetPx(/^\.twisty \{[^}]*?\swidth: (\d+)px/m),
      twistyWidth,
    );
  });
});

function changedRow(status: FileChange['status']): string {
  return renderToStaticMarkup(
    <FileRow
      path="a.ts"
      name="a.ts"
      depth={0}
      change={change('a.ts', { status })}
      selected={undefined}
      marked={false}
      onSelect={noop}
    />,
  );
}

const rowOf = (extra: Partial<FileChange>) =>
  renderToStaticMarkup(
    <FileRow
      path="AGENTS.md"
      name="AGENTS.md"
      depth={0}
      change={change('AGENTS.md', extra)}
      selected={undefined}
      marked={false}
      onSelect={noop}
    />,
  );

const folderRow = (marks: boolean) =>
  renderToStaticMarkup(
    <FolderRow
      path="src/lib"
      depth={1}
      open
      marks={marks}
      className=""
      onToggle={noop}
    >
      lib
    </FolderRow>,
  );

suite('File rows', () => {
  test('starts a changed file with the letter of its change in the color of its kind at the start of its row, its tooltip saying what the letter means, then the indentation of its depth, striking only a deleted name through', () => {
    for (const [status, kind, mark, meaning] of [
      ['A', 'added', 'A ', 'Added'],
      ['U', 'added', 'N ', 'Untracked'],
      ['M', 'modified', 'M ', 'Modified'],
      ['R', 'renamed', 'R ', 'Renamed'],
    ] as const) {
      assert.match(
        changedRow(status),
        new RegExp(
          `^<div class="row tree-row file " style="padding-left:8px" data-tip="a\\.ts"[^>]*><span class="change-mark ${kind}" aria-hidden="true" data-tip="${meaning}">${mark}</span><span class="tree-indent" style="width:10px"></span><span class="path path-cut"><span class="path-piece"><span class="path-part">a\\.ts</span></span></span>`,
        ),
        status,
      );
    }
    assert.match(
      changedRow('D'),
      /<span class="change-mark deleted" aria-hidden="true" data-tip="Deleted">D <\/span><span class="tree-indent" style="width:10px"><\/span><span class="path deleted path-cut">/,
    );
  });

  test('keeps the marks of every depth in one column at the start of the rows, indenting the name after the mark rather than the mark with it', () => {
    const html = renderToStaticMarkup(
      <FileRow
        path="src/lib/a.ts"
        name="a.ts"
        depth={2}
        change={change('src/lib/a.ts', { status: 'M' })}
        selected={undefined}
        marked={false}
        onSelect={noop}
      />,
    );
    assert.match(
      html,
      /^<div class="row tree-row file " style="padding-left:8px"[^>]*><span class="change-mark modified"[^>]*>M <\/span><span class="tree-indent" style="width:30px"><\/span>/,
    );
  });

  test('marks a symbolic link with @ beside the letter of its change, in one mark, and a file in conflict with ! in the color of a conflict, the tooltip of the mark saying what it means and that of the row the path', () => {
    const link = rowOf({ status: 'A', link: true });
    assert.match(
      link,
      /<span class="change-mark added" aria-hidden="true" data-tip="Added symbolic link">A@<\/span>/,
    );
    assert.doesNotMatch(link, /<svg/);
    tagWith(link, 'data-tip="AGENTS.md"', 'row', 'tree-row');
    assert.match(
      rowOf({ status: 'M', conflict: true }),
      /<span class="change-mark conflict" aria-hidden="true" data-tip="In conflict">! <\/span>/,
    );
  });

  test('gives an unchanged file two blanks and no tooltip where a changed one has its mark, so every name in a folder starts in one column', () => {
    const html = renderToStaticMarkup(
      <FileRow
        path="a.ts"
        name="a.ts"
        depth={0}
        change={undefined}
        selected={undefined}
        marked={false}
        onSelect={noop}
      />,
    );
    assert.doesNotMatch(html, /<svg/);
    assert.match(
      html,
      /<span class="change-mark" aria-hidden="true"> {2}<\/span><span class="tree-indent" style="width:10px"><\/span><span class="path unchanged path-cut">/,
    );
  });

  test('gives a folder of the changes a blank mark before its indentation, so its twisty stands where the names of its files start one level up, and a folder of another tree none', () => {
    assert.match(
      folderRow(true),
      /^<div class="row tree-row folder " style="padding-left:8px"[^>]*><span class="change-mark" aria-hidden="true"> {2}<\/span><span class="tree-indent" style="width:10px"><\/span><span class="twisty">/,
    );
    assert.match(
      folderRow(false),
      /^<div class="row tree-row folder " style="padding-left:18px"[^>]*><span class="twisty">/,
    );
  });

  test('dims an unchanged file', () => {
    const html = renderToStaticMarkup(
      <FileRow
        path="src/a.ts"
        name="a.ts"
        depth={1}
        change={undefined}
        selected={undefined}
        marked={false}
        onSelect={noop}
      />,
    );
    tagWith(html, 'data-tip="src/a.ts"', 'row', 'tree-row', 'file');
    tagWith(html, '', 'path', 'unchanged');
  });

  test('colors a file as the commander lists it, by its kind and its looks in the folder of the worktree it is in, and the ellipsis that cuts its name alike', () => {
    const html = renderToStaticMarkup(
      <PathLooksContext
        value={{
          subscribe: () => () => {},
          fileColors: () =>
            fileColorsOf([
              { extensions: ['ts'], colors: { light: 'blue', dark: 'blue' } },
            ]),
          known: () =>
            knownWith(new Map(), [
              {
                path: 'C:\\repo\\src\\a.ts',
                parts: [
                  { hidden: false, file: false, executable: false },
                  { hidden: false, file: false, executable: false },
                  { hidden: false, file: false, executable: false },
                  { hidden: true, file: true, executable: false },
                ],
              },
            ]),
          ask: () => {},
          know: () => {},
          dotHides: () => false,
        }}
      >
        <FileRow
          path="src/a.ts"
          name="a.ts"
          root={'C:\\repo\\src'}
          depth={1}
          change={change('src/a.ts')}
          selected={undefined}
          marked={false}
          onSelect={noop}
        />
      </PathLooksContext>,
    );
    assert.match(
      html,
      /<span class="path path-cut colored hidden" style="--file-color:light-dark\(blue, blue\)"><span class="path-piece"><span class="path-part colored hidden" style="--file-color:light-dark\(blue, blue\)">a\.ts<\/span><\/span><\/span>/,
    );
  });
});

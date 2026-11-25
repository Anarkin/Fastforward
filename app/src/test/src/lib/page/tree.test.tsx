import * as assert from 'node:assert';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import type { FileChange } from '../../../../tools/git/shared/protocol';
import { twistyWidth } from '../../../../lib/page/treeLayout';
import { FileRow } from '../../../../lib/page/tree';
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

suite('File rows', () => {
  test('starts a changed file with the letter of its change in the color of its kind before its name, striking only a deleted name through', () => {
    for (const [status, kind, mark] of [
      ['A', 'added', 'A '],
      ['U', 'added', 'N '],
      ['M', 'modified', 'M '],
      ['R', 'renamed', 'R '],
    ] as const) {
      assert.match(
        changedRow(status),
        new RegExp(
          `<span class="change-mark ${kind}" aria-hidden="true">${mark}</span><span class="path path-cut"><span class="path-piece"><span class="path-part">a\\.ts</span></span></span>`,
        ),
        status,
      );
    }
    assert.match(
      changedRow('D'),
      /<span class="change-mark deleted" aria-hidden="true">D <\/span><span class="path deleted path-cut"><span class="path-piece"><span class="path-part">a\.ts<\/span><\/span><\/span>/,
    );
  });

  test('marks a symbolic link with @ beside the letter of its change, in one mark before its name, and a file in conflict with ! in the color of a conflict, its tooltip telling on a first line what the mark means and on a second the path', () => {
    const link = rowOf({ status: 'A', link: true });
    assert.match(
      link,
      /<span class="change-mark added" aria-hidden="true">A@<\/span><span class="path path-cut">/,
    );
    assert.doesNotMatch(link, /<svg/);
    tagWith(
      link,
      'data-tip="A@: Added symbolic link\nAGENTS.md"',
      'row',
      'tree-row',
    );
    assert.match(
      rowOf({ status: 'M', conflict: true }),
      /<span class="change-mark conflict" aria-hidden="true">! <\/span>/,
    );
  });

  test('gives an unchanged file two blanks where a changed one has its mark, so every name in a folder starts in one column', () => {
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
      /<span class="change-mark" aria-hidden="true"> {2}<\/span><span class="path unchanged path-cut">/,
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

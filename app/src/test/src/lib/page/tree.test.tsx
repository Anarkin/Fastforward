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

suite('File rows', () => {
  test('starts a changed file with the icon of its kind of change, striking only a deleted name through', () => {
    for (const [status, kind] of [
      ['A', 'added'],
      ['U', 'added'],
      ['M', 'modified'],
      ['R', 'renamed'],
    ] as const) {
      assert.match(
        changedRow(status),
        new RegExp(
          `<svg class="icon change-icon ${kind}".*?</svg><span class="path"><span class="path-piece"><span class="path-part">a\\.ts</span></span></span>`,
        ),
        status,
      );
    }
    assert.match(
      changedRow('D'),
      /<svg class="icon change-icon deleted".*?<\/svg><span class="path deleted"><span class="path-piece"><span class="path-part">a\.ts<\/span><\/span><\/span>/,
    );
  });

  test('draws each kind of change as its own sign in the same frame', () => {
    const signs = (['A', 'M', 'D', 'R'] as const).map((status) =>
      changedRow(status).replace(/^.*?<svg[^>]*>|<\/svg>.*$/g, ''),
    );
    const frames = signs.map((sign) => /<rect[^>]*>/.exec(sign)?.[0]);
    assert.ok(frames[0]);
    assert.deepStrictEqual(new Set(frames).size, 1);
    assert.strictEqual(new Set(signs).size, signs.length);
  });

  test('marks a symbolic link after its name, naming it one in its tooltip, besides its kind of change', () => {
    const html = renderToStaticMarkup(
      <FileRow
        path="AGENTS.md"
        name="AGENTS.md"
        depth={0}
        change={change('AGENTS.md', { status: 'A', link: true })}
        selected={undefined}
        marked={false}
        onSelect={noop}
      />,
    );
    assert.match(
      html,
      /<svg class="icon change-icon added".*?<\/svg><span class="path"><span class="path-piece"><span class="path-part">AGENTS\.md<\/span><\/span><\/span><svg class="icon link-icon"/,
    );
    tagWith(html, 'title="Added symbolic link: AGENTS.md"', 'row', 'tree-row');
    assert.doesNotMatch(changedRow('A'), /link-icon/);
  });

  test('gives an unchanged file no icon', () => {
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
    tagWith(html, 'title="src/a.ts"', 'row', 'tree-row', 'file');
    tagWith(html, '', 'path', 'unchanged');
  });

  test('colors a file as the commander lists it, by its kind and its looks in the folder of the worktree it is in', () => {
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
      /<span class="path"><span class="path-piece"><span class="path-part colored hidden" style="--file-color:light-dark\(blue, blue\)">a\.ts<\/span><\/span><\/span>/,
    );
  });
});

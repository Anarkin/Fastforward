import * as assert from 'node:assert';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import type { FileChange } from '../../shared/protocol';
import { FileRow, twistyWidth } from '../../webview/tree';
import { fileChange as change, noop, stylesheetPx, tagWith } from '../fixtures';

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
          `<svg class="icon change-icon ${kind}".*?</svg><span class="path">a\\.ts</span>`,
        ),
        status,
      );
    }
    assert.match(
      changedRow('D'),
      /<svg class="icon change-icon deleted".*?<\/svg><span class="path deleted">a\.ts<\/span>/,
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
      /<svg class="icon change-icon added".*?<\/svg><span class="path">AGENTS\.md<\/span><svg class="icon link-icon"/,
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
});

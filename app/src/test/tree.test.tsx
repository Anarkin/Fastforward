import * as assert from 'node:assert';
import { renderToStaticMarkup } from 'react-dom/server';
import type { FileChange } from '../shared/protocol';
import { FileRow, twistyWidth } from '../webview/tree';
import { fileChange as change, noop, stylesheetPx, tagWith } from './fixtures';

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
  test('shows a change plainly, marking only a deleted file', () => {
    for (const status of ['A', 'M', 'R', 'U'] as const) {
      assert.match(
        changedRow(status),
        /<span class="path">a\.ts<\/span>/,
        status,
      );
    }
    assert.match(changedRow('D'), /<span class="path deleted">a\.ts<\/span>/);
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

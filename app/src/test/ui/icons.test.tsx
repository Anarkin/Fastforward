import * as assert from 'node:assert';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import {
  AddIcon,
  BookmarkIcon,
  ChangeIcon,
  CloseIcon,
  ExpandAllIcon,
} from '../../ui/icons';

function strokesOfPaths(html: string): number[] {
  return [...html.matchAll(/<path d="([^"]*)"/g)].map(
    ([, d]) => d.match(/M/gi)?.length ?? 0,
  );
}

suite('Icons', () => {
  test('draws the two strokes of the close icon as paths of their own, as Chromium antialiases strokes crossing in one path unevenly, leaving the middle of the X blotchy', () => {
    assert.deepStrictEqual(
      strokesOfPaths(renderToStaticMarkup(<CloseIcon />)),
      [1, 1],
    );
  });

  test('draws the bookmark star filled for a folder bookmarked and as an outline otherwise, the same star either way', () => {
    const filled = renderToStaticMarkup(<BookmarkIcon filled />);
    const outline = renderToStaticMarkup(<BookmarkIcon filled={false} />);
    assert.match(filled, /class="icon bookmark-icon filled"/);
    assert.match(filled, /<path d="[^"]+" fill="currentColor"/);
    assert.match(outline, /class="icon bookmark-icon"/);
    assert.doesNotMatch(outline, /fill="currentColor"/);
    assert.strictEqual(
      /<path d="([^"]+)"/.exec(filled)?.[1],
      /<path d="([^"]+)"/.exec(outline)?.[1],
    );
  });

  test('draws the two strokes of every plus sign as paths of their own, as Chromium antialiases strokes crossing in one path unevenly, drawing one bar of the plus darker than the other', () => {
    assert.deepStrictEqual(
      [
        renderToStaticMarkup(<AddIcon />),
        renderToStaticMarkup(<ChangeIcon kind="added" />),
        renderToStaticMarkup(<ExpandAllIcon />),
      ].map(strokesOfPaths),
      [
        [1, 1],
        [1, 1],
        [1, 1, 1],
      ],
    );
  });
});

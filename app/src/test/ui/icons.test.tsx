import * as assert from 'node:assert';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import { AddIcon, ChangeIcon, CloseIcon, ExpandAllIcon } from '../../ui/icons';

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

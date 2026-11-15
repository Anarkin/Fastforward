import * as assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import { AppIcon } from '../../../../shell/page/appIcon';

function drawingOf(svg: string) {
  return {
    viewBox: /viewBox="([^"]*)"/.exec(svg)?.[1],
    shapes: [
      ...svg.matchAll(/<(rect|line|circle|path|polyline)\b([^>]*?)\/?>/g),
    ].map(([, tag, attributes]) => ({
      tag,
      attributes: Object.fromEntries(
        [...(attributes ?? '').matchAll(/([\w-]+)="([^"]*)"/g)].map(
          ([, name, value]) => [name, value],
        ),
      ),
    })),
  };
}

suite('App icon', () => {
  test('draws the same icon as the taskbar, the mark on its white rounded tile, so it looks alike in both places', () => {
    assert.deepStrictEqual(
      drawingOf(renderToStaticMarkup(<AppIcon />)),
      drawingOf(
        readFileSync(join(__dirname, '../../../../../build/icon.svg'), 'utf8'),
      ),
    );
  });
});

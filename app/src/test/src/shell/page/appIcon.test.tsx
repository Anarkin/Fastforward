import * as assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import { AppIcon } from '../../../../shell/page/appIcon';
import { stylesheet } from '../../../helpers/pageSources';

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
  test('draws the same icon as build/icon.svg, the disc the taskbar, the Dock and the desktop show, so it looks alike in every place', () => {
    assert.deepStrictEqual(
      drawingOf(renderToStaticMarkup(<AppIcon size={480} />)),
      drawingOf(
        readFileSync(join(__dirname, '../../../../../build/icon.svg'), 'utf8'),
      ),
    );
  });

  test('draws the icon on as many units as the device pixels it takes, the edges between its bands on whole ones of them, so none blends two bands', () => {
    const { viewBox, shapes } = drawingOf(
      renderToStaticMarkup(<AppIcon size={16} />),
    );
    assert.strictEqual(viewBox, '0 0 16 16');
    assert.match(shapes.at(-1)?.attributes['y'] ?? '', /^\d+$/);
  });

  test('sizes the icon of the title bar as --app-icon-size of the stylesheet does', () => {
    const [, size] = /--app-icon-size: (\d+)px;/.exec(stylesheet()) ?? [];
    assert.match(
      renderToStaticMarkup(<AppIcon />),
      new RegExp(
        `^<svg class="title-bar-icon" width="${size}" height="${size}"`,
      ),
    );
  });
});

import * as assert from 'node:assert';
import { JSDOM, VirtualConsole } from 'jsdom';
import { suite, test } from 'vitest';
import { cellsSupported } from '../../../../../tools/viewer/page/cellSurface';

suite('Surface the cells are drawn on', () => {
  test('says no cells can be drawn in a page without WebGL, so text is drawn as elements there', () => {
    const { document } = new JSDOM('<!doctype html>', {
      virtualConsole: new VirtualConsole(),
    }).window;

    assert.strictEqual(cellsSupported(document), false);
    assert.strictEqual(cellsSupported(document), false);
  });
});

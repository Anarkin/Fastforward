import * as assert from 'node:assert';
import {
  drawsOverlay,
  followedScroller,
  scrollPerPixel,
  thumbOf,
} from '../webview/overlayScrollbars';
import { stylesheet } from './fixtures';

suite('Overlay scrollbars', () => {
  test('shows no thumb when everything fits', () => {
    assert.strictEqual(thumbOf(500, 500, 0), undefined);
    assert.strictEqual(thumbOf(500.5, 500, 0), undefined);
  });

  test('sizes the thumb by how much is shown, and moves it from end to end', () => {
    assert.deepStrictEqual(thumbOf(1000, 500, 0), { offset: 0, length: 250 });
    assert.deepStrictEqual(thumbOf(1000, 500, 250), {
      offset: 125,
      length: 250,
    });
    assert.deepStrictEqual(thumbOf(1000, 500, 500), {
      offset: 250,
      length: 250,
    });
  });

  test('keeps a thumb for long content big enough to grab, inside the track', () => {
    assert.deepStrictEqual(thumbOf(1_000_000, 500, 0), {
      offset: 0,
      length: 24,
    });
    assert.deepStrictEqual(thumbOf(1_000_000, 500, 2_000_000), {
      offset: 476,
      length: 24,
    });
  });

  test('scrolls the content as far for each pixel the thumb is dragged as it has room to', () => {
    assert.strictEqual(scrollPerPixel(1000, 500), 2);
    assert.strictEqual(scrollPerPixel(500, 500), 0);
  });

  test('keeps moving with the area being dragged, whatever the pointer is over', () => {
    assert.strictEqual(followedScroller(true, 'list', 'diff'), 'list');
    assert.strictEqual(followedScroller(true, 'list', null), 'list');
    assert.strictEqual(followedScroller(false, 'list', 'diff'), 'diff');
  });

  test('leaves only the vertical scrollbar to an area with its own, like the minimap', () => {
    assert.strictEqual(drawsOverlay('vertical', true), false);
    assert.strictEqual(drawsOverlay('horizontal', true), true);
    assert.strictEqual(drawsOverlay('vertical', false), true);
  });

  test('takes no room for the native scrollbars', () => {
    assert.match(
      stylesheet(),
      /::-webkit-scrollbar \{\s*width: 0;\s*height: 0;\s*\}/,
    );
  });
});

import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  firstMode,
  imageScrolled,
  previewOf,
  previewUrl,
} from '../../../../../tools/commander/page/previews';

suite('Previews of a file viewed', () => {
  test('previews images, SVG among them, and Markdown, by the name of the file', () => {
    assert.strictEqual(previewOf('C:\\pictures\\cat.PNG'), 'image');
    assert.strictEqual(previewOf('/icons/logo.svg'), 'image');
    assert.strictEqual(previewOf('/docs/README.md'), 'markdown');
    assert.strictEqual(previewOf('/docs/notes.markdown'), 'markdown');
    assert.strictEqual(previewOf('/docs/notes.txt'), undefined);
  });

  test('opens a file in its preview when it has one, and in text otherwise, binary or not', () => {
    assert.strictEqual(firstMode('/a/cat.png'), 'preview');
    assert.strictEqual(firstMode('/a/README.md'), 'preview');
    assert.strictEqual(firstMode('/a/app.exe'), 'text');
    assert.strictEqual(firstMode('/a/notes.txt'), 'text');
  });

  test('asks for an image or PDF again once the file changes, though its size does not, rather than showing the one fetched before', () => {
    const before = previewUrl(
      { tab: '3', size: 4, version: '7:1000:4' },
      '/a/cat.png',
    );
    const after = previewUrl(
      { tab: '3', size: 4, version: '7:2000:4' },
      '/a/cat.png',
    );

    assert.notStrictEqual(after, before);
    assert.strictEqual(
      previewUrl({ tab: '3', size: 4, version: '7:2000:4' }, '/a/cat.png'),
      after,
    );
  });

  test('scrolls an image shown at its real size by a step, a screen less a step, or to an end, either way, never past an edge, as the browser leaves keys alone on some systems', () => {
    const scroller = {
      scrollTop: 500,
      scrollLeft: 300,
      scrollHeight: 2000,
      scrollWidth: 3000,
      clientHeight: 600,
      clientWidth: 1000,
    };
    assert.deepStrictEqual(imageScrolled(scroller, 'down'), {
      top: 540,
      left: 300,
    });
    assert.deepStrictEqual(imageScrolled(scroller, 'up'), {
      top: 460,
      left: 300,
    });
    assert.deepStrictEqual(imageScrolled(scroller, 'pageDown'), {
      top: 1060,
      left: 300,
    });
    assert.deepStrictEqual(imageScrolled(scroller, 'pageUp'), {
      top: 0,
      left: 300,
    });
    assert.deepStrictEqual(imageScrolled(scroller, 'first'), {
      top: 0,
      left: 300,
    });
    assert.deepStrictEqual(imageScrolled(scroller, 'last'), {
      top: 1400,
      left: 300,
    });
    assert.deepStrictEqual(imageScrolled(scroller, 1), { top: 500, left: 340 });
    assert.deepStrictEqual(imageScrolled(scroller, -1), {
      top: 500,
      left: 260,
    });
    assert.deepStrictEqual(
      imageScrolled({ ...scroller, scrollLeft: 1990 }, 1),
      { top: 500, left: 2000 },
    );
  });
});

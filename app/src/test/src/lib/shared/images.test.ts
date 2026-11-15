import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { imageType } from '../../../../lib/shared/images';

suite('Images', () => {
  test('knows the images Chromium shows by their extension, in any case', () => {
    assert.strictEqual(imageType('a/b.png'), 'image/png');
    assert.strictEqual(imageType('photo.JPG'), 'image/jpeg');
    assert.strictEqual(imageType('photo.jpeg'), 'image/jpeg');
    assert.strictEqual(imageType('favicon.ico'), 'image/x-icon');
    assert.strictEqual(imageType('vector.svg'), 'image/svg+xml');
    for (const path of ['a.bin', 'png', '.png', 'a.png/b']) {
      assert.strictEqual(imageType(path), undefined, path);
    }
  });
});

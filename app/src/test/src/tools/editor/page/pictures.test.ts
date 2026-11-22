import * as assert from 'node:assert';
import { Text } from '@codemirror/state';
import { suite, test } from 'vitest';
import {
  controlsIn,
  controlsOf,
  picturedAt,
} from '../../../../../tools/editor/page/pictures';

suite('Control pictures of the editor', () => {
  test('counts the control characters of a text, leaving out the tab and the line ends, in a document of many lines too', () => {
    assert.strictEqual(controlsIn('a\u0001b\u001b[0m\u007f\tc\r'), 3);
    assert.strictEqual(controlsIn('plain'), 0);
    assert.strictEqual(
      controlsOf(
        Text.of(Array.from({ length: 5000 }, (_, line) => `${line}\u0007`)),
      ),
      5000,
    );
  });

  test('draws the pictures of a file with up to eight control characters a line, or 500 in all, and leaves a file denser in them as it is, as an element for each picture took the editor longer to paint at every frame than the characters took Chromium to lay out once', () => {
    assert.strictEqual(picturedAt(0, 1), true);
    assert.strictEqual(picturedAt(500, 1), true);
    assert.strictEqual(picturedAt(501, 1), false);
    assert.strictEqual(picturedAt(8000, 1000), true);
    assert.strictEqual(picturedAt(8001, 1000), false);
    assert.strictEqual(picturedAt(18_557, 622), false);
    assert.strictEqual(picturedAt(150, 98), true);
  });
});

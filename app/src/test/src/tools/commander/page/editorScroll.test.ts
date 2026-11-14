import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { leadingOf } from '../../../../../tools/commander/page/editorScroll';

suite('Scrolling of the editor', () => {
  test('measures the leading above and below the text of a row apart, as the browser may give the one above a pixel less', () => {
    assert.deepStrictEqual(leadingOf(100, 21, { top: 101, bottom: 119 }), {
      above: 1,
      below: 2,
    });
    assert.deepStrictEqual(leadingOf(100, 18, { top: 101, bottom: 117 }), {
      above: 1,
      below: 1,
    });
  });
});

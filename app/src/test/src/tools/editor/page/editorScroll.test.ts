import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  leadingOf,
  wholeRows,
} from '../../../../../tools/editor/page/editorScroll';

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

  test('rounds the height of a stretch of a long line left undrawn to whole rows, at least one, so the rows drawn after it stay on the rows scrolled by', () => {
    assert.strictEqual(wholeRows(1234.5, 22), 1232);
    assert.strictEqual(wholeRows(1245, 22), 1254);
    assert.strictEqual(wholeRows(5, 22), 22);
    assert.strictEqual(wholeRows(17.6 * 3 + 0.1, 17.6), 17.6 * 3);
    assert.strictEqual(wholeRows(40, 0), 40);
  });
});

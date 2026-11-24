import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { DrawnLines } from '../../../../../tools/editor/page/drawnLines';

suite('Lines the editor draws', () => {
  test('gives a line drawn again as it was the same line, a line of another text or ending a new one, and forgets the lines a draw left out, so scrolling through a file keeps no copy of all of it', () => {
    const drawn = new DrawnLines();
    drawn.draw();
    const first = drawn.of(1, 'one', '\n');
    const second = drawn.of(2, 'two', '\n');
    assert.deepStrictEqual(first, {
      start: 1,
      end: 2,
      text: 'one',
      ending: '\n',
    });
    assert.strictEqual(drawn.of(1, 'one', '\n'), first);

    drawn.draw();
    assert.strictEqual(drawn.of(2, 'two', '\n'), second);
    assert.notStrictEqual(drawn.of(3, 'three', '\n'), undefined);
    assert.notStrictEqual(drawn.of(2, 'two', '\r\n'), second);

    drawn.draw();
    drawn.draw();
    assert.notStrictEqual(drawn.of(1, 'one', '\n'), first);
    assert.strictEqual(drawn.size(), 1);
  });
});

import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { scissorOf } from '../../../../../components/cells/page/scissor';

suite('Clip of the cells', () => {
  test('clips the text to where it starts after the line numbers and below the rows stuck at the top, and nowhere when neither is asked for', () => {
    assert.deepStrictEqual(scissorOf(40, 0, 300, 200), {
      x: 40,
      y: 0,
      width: 260,
      height: 200,
    });
    assert.deepStrictEqual(scissorOf(0, 30, 300, 200), {
      x: 0,
      y: 30,
      width: 300,
      height: 170,
    });
    assert.strictEqual(scissorOf(0, 0, 300, 200), undefined);
  });

  test('clips all of the text away when the line numbers are as wide as the view or wider, as a narrow pane drew the text over its line numbers rather than none of it', () => {
    assert.deepStrictEqual(scissorOf(40, 0, 30, 200), {
      x: 30,
      y: 0,
      width: 0,
      height: 200,
    });
    assert.deepStrictEqual(scissorOf(0, 250, 300, 200), {
      x: 0,
      y: 200,
      width: 300,
      height: 0,
    });
  });
});

import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  drawnWithRoom,
  type Presented,
} from '../../../../../components/cells/page/listCanvas';

const framesOf = (answers: readonly (Presented | undefined)[]) => {
  let drawn = 0;
  drawnWithRoom(() => answers[drawn++]);
  return drawn;
};

suite('List canvas room', () => {
  test('draws a frame again once its atlas filled up and was emptied, and no more than once, so a screen of rows that fits no atlas draws what fits rather than calling itself until the page falls over', () => {
    assert.strictEqual(framesOf(['drawn']), 1);
    assert.strictEqual(framesOf([undefined]), 1);
    assert.strictEqual(framesOf(['full', 'drawn']), 2);
    assert.strictEqual(framesOf(['full', 'full', 'full', 'full']), 2);
  });
});

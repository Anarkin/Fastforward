import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  grabPointer,
  minimapScrollTop,
  pointerFraction,
} from '../../../../lib/page/minimapPointer';
import { noModifiers } from '../../../helpers/keys';

suite('Minimap', () => {
  test('takes the pointer it is pressed with, starting no text selection, so dragging it scrolls even with text selected', () => {
    const calls: string[] = [];
    const grabbed = grabPointer({
      button: 0,
      ...noModifiers,
      pointerId: 7,
      preventDefault: () => calls.push('preventDefault'),
      currentTarget: {
        setPointerCapture: (id: number) => calls.push(`capture ${id}`),
      },
    });
    assert.strictEqual(grabbed, true);
    assert.deepStrictEqual(calls, ['preventDefault', 'capture 7']);
  });

  test('leaves a press of any but the main button alone, as the scrollbars do, so a right or middle click does not scroll', () => {
    for (const button of [1, 2, 3, 4]) {
      const calls: string[] = [];
      const grabbed = grabPointer({
        button,
        ...noModifiers,
        pointerId: 7,
        preventDefault: () => calls.push('preventDefault'),
        currentTarget: {
          setPointerCapture: (id: number) => calls.push(`capture ${id}`),
        },
      });
      assert.strictEqual(grabbed, false);
      assert.deepStrictEqual(calls, []);
    }
  });

  test('reads how far down the strip the pointer is', () => {
    assert.strictEqual(pointerFraction(150, { top: 100, height: 200 }), 0.25);
    assert.strictEqual(pointerFraction(150, { top: 100, height: 0 }), 0);
  });

  test('centers the view where it is clicked, without scrolling past either end', () => {
    assert.strictEqual(minimapScrollTop(0.5, 1000, 200), 400);
    assert.strictEqual(minimapScrollTop(0.02, 1000, 200), 0);
    assert.strictEqual(minimapScrollTop(0.98, 1000, 200), 800);
  });
});

import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  fontSizeFor,
  steppedZoom,
  wheelZoom,
  zoomedOrigin,
} from '../../../../../tools/canvas/page/zoom';

suite('Canvas zoom', () => {
  test('steps the zoom a device pixel of the width of a cell at a time, from half the cell of the font to three times it', () => {
    assert.strictEqual(steppedZoom(0, 1, 7), 1);
    assert.strictEqual(steppedZoom(0, -1, 7), -1);
    assert.strictEqual(steppedZoom(-3, -1, 7), -3);
    assert.strictEqual(steppedZoom(14, 1, 7), 14);
    assert.strictEqual(steppedZoom(20, 0, 7), 14);
    assert.strictEqual(steppedZoom(-9, 0, 9), -4);
    assert.strictEqual(steppedZoom(0, -5, 3), -1);
  });

  test('takes the size of the font whose character is as many device pixels wide as the step asks, so the window rounds it to them exactly', () => {
    const base = { size: 12, ch: 7.2246, advance: 9, ratio: 1.25 };
    for (const step of [-3, 1, 5]) {
      const ch =
        ((fontSizeFor(step, base) ?? Number.NaN) * base.ch) / base.size;
      assert.ok(
        Math.abs(ch * base.ratio - (base.advance + step)) < 1e-9,
        String(step),
      );
    }
    assert.strictEqual(fontSizeFor(0, base), undefined);
  });

  test('keeps the cell under the pointer under it as the zoom changes, settling on whole cells', () => {
    assert.deepStrictEqual(
      zoomedOrigin(
        { column: 10, row: 5 },
        { x: 70, y: 36 },
        { width: 7, height: 18 },
        { width: 14, height: 36 },
      ),
      { column: 15, row: 6 },
    );
    assert.deepStrictEqual(
      zoomedOrigin(
        { column: 0, row: 0 },
        { x: 0, y: 0 },
        { width: 7, height: 18 },
        { width: 8, height: 20 },
      ),
      { column: 0, row: 0 },
    );
  });

  test('zooms in a step a notch of the wheel up and out a step a notch down, around the pointer, adding up the strokes of a touchpad until they make a notch', () => {
    const known = {
      advance: 7,
      origin: { column: 0, row: 0 },
      cell: { width: 7, height: 18 },
    };
    const at = { x: 0, y: 0 };
    assert.deepStrictEqual(wheelZoom(-100, 0, known, at), {
      rest: 0,
      zoomed: { step: 1, origin: { column: 0, row: 0 } },
    });
    assert.deepStrictEqual(wheelZoom(100, 0, known, at).zoomed?.step, -1);
    assert.deepStrictEqual(wheelZoom(-30, 0, known, at), { rest: -30 });
    assert.deepStrictEqual(wheelZoom(-130, 0, known, at).rest, -30);
    assert.deepStrictEqual(wheelZoom(-100, 14, known, at), { rest: 0 });
  });
});

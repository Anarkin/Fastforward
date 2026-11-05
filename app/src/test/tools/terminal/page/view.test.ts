import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { screenMargin, wheelLines } from '../../../../tools/terminal/page/view';

suite('Terminal view', () => {
  test('moves the terminal onto whole device pixels by its margin rather than a transform, which would make the compositor resample its canvas, blurring it', () => {
    const [top, , , left] = screenMargin(14, 43.2, 1.25)
      .split(' ')
      .map((value) => parseFloat(value));
    for (const device of [(14 + left) * 1.25, (43.2 + top) * 1.25]) {
      assert.ok(Math.abs(device - Math.round(device)) < 0.01, String(device));
    }
    assert.strictEqual(screenMargin(14, 43, 1), '0px 0 0 0px');
  });

  test('scrolls the history by the rows of the setting for each notch of a mouse wheel, leaving a touchpad, a held modifier, and the screens of apps such as vim and less to the terminal', () => {
    const notch = {
      deltaY: 100,
      deltaMode: 0,
      wheelDeltaY: -120,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false,
    };
    const shell = { buffer: 'normal', mouse: 'none' } as const;
    assert.strictEqual(wheelLines(notch, shell, 1), 1);
    assert.strictEqual(
      wheelLines({ ...notch, deltaY: -200, wheelDeltaY: 240 }, shell, 3),
      -6,
    );
    assert.strictEqual(
      wheelLines({ ...notch, deltaY: 30, wheelDeltaY: -30 }, shell, 1),
      undefined,
    );
    assert.strictEqual(
      wheelLines({ ...notch, altKey: true }, shell, 1),
      undefined,
    );
    assert.strictEqual(
      wheelLines(notch, { buffer: 'alternate', mouse: 'none' }, 1),
      undefined,
    );
    assert.strictEqual(
      wheelLines(notch, { buffer: 'normal', mouse: 'vt200' }, 1),
      undefined,
    );
  });
});

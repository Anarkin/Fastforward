import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { windowButtonColor } from '../../../../shell/page/windowButtons';

suite('Window buttons', () => {
  test('gives the window buttons the color of the text as Electron reads it, whatever syntax the theme writes it in, as Electron takes only hex, names, and rgb() and hsl() with commas', () => {
    const drawn: string[] = [];
    const pixel = (data: readonly number[]) => ({
      fillStyle: '',
      fillRect() {
        drawn.push(this.fillStyle);
      },
      getImageData: () => ({ data }),
    });
    assert.strictEqual(
      windowButtonColor('oklch(0.2 0 0)', pixel([22, 22, 22, 255])),
      'rgba(22, 22, 22, 1)',
    );
    assert.strictEqual(
      windowButtonColor('rgb(0 0 0 / 50%)', pixel([0, 0, 0, 51])),
      'rgba(0, 0, 0, 0.2)',
    );
    assert.deepStrictEqual(drawn, ['oklch(0.2 0 0)', 'rgb(0 0 0 / 50%)']);
    assert.strictEqual(windowButtonColor('#333', null), '#333');
  });
});

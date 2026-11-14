import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  cursorLookOf,
  cursorVariables,
  defaultCursorLook,
} from '../../../shell/shared/cursorSettings';

const barOf = (width: string) =>
  cursorLookOf((name) => (name === cursorVariables.barWidth ? width : ''))
    .barWidth;

suite('Cursor settings', () => {
  test('reads its look from the variables of the theme, falling back on a steady block of a bar two pixels wide', () => {
    const variables: Record<string, string> = {
      [cursorVariables.style]: ' bar',
      [cursorVariables.barWidth]: ' 3',
      [cursorVariables.blink]: ' on',
    };
    assert.deepStrictEqual(
      cursorLookOf((name) => variables[name] ?? ''),
      { style: 'bar', barWidth: 3, blink: true },
    );
    assert.deepStrictEqual(
      cursorLookOf(() => ''),
      defaultCursorLook,
    );
    assert.deepStrictEqual(defaultCursorLook, {
      style: 'block',
      barWidth: 2,
      blink: false,
    });
    assert.deepStrictEqual(
      cursorLookOf(
        (name) =>
          ({
            [cursorVariables.style]: 'beam',
            [cursorVariables.barWidth]: 'wide',
          })[name] ?? '',
      ),
      defaultCursorLook,
    );
  });

  test('keeps a bar between one and ten whole pixels wide, as xterm.js draws its bar in whole CSS pixels', () => {
    assert.strictEqual(barOf('0'), 1);
    assert.strictEqual(barOf('1.5'), 2);
    assert.strictEqual(barOf('3.2'), 3);
    assert.strictEqual(barOf('40'), 10);
  });
});

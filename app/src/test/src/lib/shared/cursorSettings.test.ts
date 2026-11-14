import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  cursorLookOf,
  cursorVariables,
  defaultCursorLook,
} from '../../../../lib/shared/cursorSettings';

const barOf = (width: string) =>
  cursorLookOf((name) => (name === cursorVariables.width ? width : '')).width;

suite('Cursor settings', () => {
  test('reads its look from the variables of the theme, falling back on a steady block of a bar two pixels wide', () => {
    const variables: Record<string, string> = {
      [cursorVariables.style]: ' bar',
      [cursorVariables.width]: ' 3',
      [cursorVariables.blink]: ' on',
    };
    assert.deepStrictEqual(
      cursorLookOf((name) => variables[name] ?? ''),
      { style: 'bar', width: 3, blink: true },
    );
    assert.deepStrictEqual(
      cursorLookOf(() => ''),
      defaultCursorLook,
    );
    assert.deepStrictEqual(defaultCursorLook, {
      style: 'block',
      width: 2,
      blink: false,
    });
    assert.deepStrictEqual(
      cursorLookOf(
        (name) =>
          ({
            [cursorVariables.style]: 'beam',
            [cursorVariables.width]: 'wide',
          })[name] ?? '',
      ),
      defaultCursorLook,
    );
  });

  test('takes a block, a bar, an underline or an outline as its style', () => {
    for (const style of ['block', 'bar', 'underline', 'outline']) {
      assert.strictEqual(
        cursorLookOf((name) => (name === cursorVariables.style ? style : ''))
          .style,
        style,
      );
    }
  });

  test('keeps a bar between one and ten whole pixels wide, as xterm.js draws its bar in whole CSS pixels', () => {
    assert.strictEqual(barOf('0'), 1);
    assert.strictEqual(barOf('1.5'), 2);
    assert.strictEqual(barOf('3.2'), 3);
    assert.strictEqual(barOf('40'), 10);
  });
});

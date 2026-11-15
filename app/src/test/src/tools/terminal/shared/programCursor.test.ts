import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  programCursor,
  programCursorSequence,
  setsCursorMode,
} from '../../../../../tools/terminal/shared/programCursor';

const paramsOf = (sequence: string) => [
  Number(sequence.replace('\x1b[', '').replace(' q', '')),
];

suite('Cursor a program asks for', () => {
  test('follows a program setting the style of the cursor and its blinking as xterm.js does, the settings again on 0 or no parameter, which xterm.js reads as 0, and only the blinking past 6', () => {
    assert.strictEqual(programCursor([]), 'reset');
    assert.strictEqual(programCursor([0]), 'reset');
    assert.deepStrictEqual(
      [1, 2, 3, 4, 5, 6].map((param) => programCursor([param])),
      [
        { style: 'block', blink: true },
        { style: 'block', blink: false },
        { style: 'underline', blink: true },
        { style: 'underline', blink: false },
        { style: 'bar', blink: true },
        { style: 'bar', blink: false },
      ],
    );
    assert.deepStrictEqual(programCursor([7]), {
      style: undefined,
      blink: true,
    });
  });

  test('follows a program showing and hiding the cursor by its mode alone', () => {
    assert.strictEqual(setsCursorMode([25]), true);
    assert.strictEqual(setsCursorMode([1049, 25]), true);
    assert.strictEqual(setsCursorMode([[25]]), true);
    assert.strictEqual(setsCursorMode([1049]), false);
  });

  test('asks again for the style and blinking a program asked for, the blinking alone of one that asked for no style, and nothing of one that asked for neither', () => {
    for (const param of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const asked = programCursor([param]);
      assert.ok(asked !== 'reset');
      assert.deepStrictEqual(
        programCursor(
          paramsOf(programCursorSequence(asked.style, asked.blink)),
        ),
        asked,
        String(param),
      );
    }
    assert.strictEqual(programCursorSequence(undefined, undefined), '');
  });
});

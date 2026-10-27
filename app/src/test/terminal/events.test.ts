import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  PageInputs,
  type PageInput,
  type Pointing,
} from '../../terminal/events';

const cells: Pointing = {
  cell: { width: 10, height: 20 },
  pixels: false,
  stretch: 1,
};
const pixels: Pointing = { ...cells, pixels: true };

function clicks([first]: PageInput[]): number | undefined {
  return 'clickCount' in first ? first.clickCount : undefined;
}

function inputs(time = () => 0) {
  return new PageInputs(time);
}

suite('Page inputs', () => {
  test('types a character as a key press with the character between', () => {
    assert.deepStrictEqual(inputs().of({ kind: 'text', text: 'a' }, cells), [
      { type: 'keyDown', keyCode: 'a', modifiers: [] },
      { type: 'char', keyCode: 'a', modifiers: [] },
      { type: 'keyUp', keyCode: 'a', modifiers: [] },
    ]);
  });

  test('holds Shift for a capital and names the space bar', () => {
    const page = inputs();
    assert.deepStrictEqual(page.of({ kind: 'text', text: 'H' }, cells)[0], {
      type: 'keyDown',
      keyCode: 'H',
      modifiers: ['shift'],
    });
    assert.deepStrictEqual(page.of({ kind: 'text', text: ' ' }, cells), [
      { type: 'keyDown', keyCode: 'Space', modifiers: [] },
      { type: 'char', keyCode: ' ', modifiers: [] },
      { type: 'keyUp', keyCode: 'Space', modifiers: [] },
    ]);
  });

  test('presses a named key with its modifiers, typing nothing', () => {
    assert.deepStrictEqual(
      inputs().of({ kind: 'key', key: 'Up', modifiers: ['control'] }, cells),
      [
        { type: 'keyDown', keyCode: 'Up', modifiers: ['control'] },
        { type: 'keyUp', keyCode: 'Up', modifiers: ['control'] },
      ],
    );
  });

  test('types pasted text character by character, leaving out line breaks', () => {
    assert.deepStrictEqual(
      inputs().of({ kind: 'paste', text: 'a\r\nb' }, cells),
      [
        { type: 'char', keyCode: 'a', modifiers: [] },
        { type: 'char', keyCode: 'b', modifiers: [] },
      ],
    );
  });

  test('clicks in the middle of the cell the terminal names', () => {
    assert.deepStrictEqual(
      inputs().of(
        {
          kind: 'mouse',
          action: 'press',
          button: 'left',
          x: 3,
          y: 2,
          modifiers: ['shift'],
        },
        cells,
      ),
      [
        {
          type: 'mouseDown',
          button: 'left',
          x: 25,
          y: 30,
          clickCount: 1,
          modifiers: ['shift'],
        },
      ],
    );
  });

  test('clicks on the pixel the terminal names when it reports pixels', () => {
    assert.deepStrictEqual(
      inputs().of(
        {
          kind: 'mouse',
          action: 'release',
          button: 'right',
          x: 101,
          y: 51,
          modifiers: [],
        },
        pixels,
      ),
      [
        {
          type: 'mouseUp',
          button: 'right',
          x: 100,
          y: 50,
          clickCount: 1,
          modifiers: [],
        },
      ],
    );
  });

  test('points where the page is under a stretched picture of it', () => {
    assert.deepStrictEqual(
      inputs().of(
        {
          kind: 'mouse',
          action: 'move',
          button: undefined,
          x: 3,
          y: 2,
          modifiers: [],
        },
        { ...cells, stretch: 1.25 },
      ),
      [{ type: 'mouseMove', x: 20, y: 30, modifiers: [] }],
    );
  });

  test('counts a second press of the same button nearby and soon after as a double click', () => {
    let now = 0;
    const page = inputs(() => now);
    const press = {
      kind: 'mouse',
      action: 'press',
      button: 'left',
      x: 3,
      y: 2,
      modifiers: [],
    } as const;
    page.of(press, cells);
    page.of({ ...press, action: 'release' }, cells);
    now = 300;
    assert.strictEqual(clicks(page.of(press, cells)), 2);
    assert.strictEqual(
      clicks(page.of({ ...press, action: 'release' }, cells)),
      2,
    );
    now = 2000;
    assert.strictEqual(clicks(page.of(press, cells)), 1);
    now = 2100;
    assert.strictEqual(clicks(page.of({ ...press, x: 9 }, cells)), 1);
  });

  test('moves the pointer with the button held while dragging, and without once released', () => {
    const page = inputs();
    const at = { x: 3, y: 2, modifiers: [] } as const;
    page.of({ kind: 'mouse', action: 'press', button: 'left', ...at }, cells);
    assert.deepStrictEqual(
      page.of({ kind: 'mouse', action: 'move', button: 'left', ...at }, cells),
      [
        {
          type: 'mouseMove',
          button: 'left',
          x: 25,
          y: 30,
          modifiers: ['leftbuttondown'],
        },
      ],
    );
    page.of({ kind: 'mouse', action: 'release', button: 'left', ...at }, cells);
    assert.deepStrictEqual(
      page.of(
        { kind: 'mouse', action: 'move', button: undefined, ...at },
        cells,
      ),
      [{ type: 'mouseMove', x: 25, y: 30, modifiers: [] }],
    );
  });

  test('turns the wheel a notch, scrolling down for a turn down', () => {
    assert.deepStrictEqual(
      inputs().of(
        { kind: 'wheel', direction: 'down', x: 1, y: 1, modifiers: [] },
        cells,
      ),
      [
        {
          type: 'mouseWheel',
          x: 5,
          y: 10,
          deltaX: 0,
          deltaY: -100,
          wheelTicksX: 0,
          wheelTicksY: -1,
          canScroll: true,
          modifiers: [],
        },
      ],
    );
  });

  test('sends nothing for what the terminal reports of itself', () => {
    assert.deepStrictEqual(
      inputs().of({ kind: 'attributes', values: [4] }, cells),
      [],
    );
  });
});

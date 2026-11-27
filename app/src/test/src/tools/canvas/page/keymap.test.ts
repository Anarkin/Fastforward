import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { clicked } from '../../../../../lib/shared/keymap';
import { canvasKeymap } from '../../../../../tools/canvas/page/keymap';

const press = (modifiers: {
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
}) => ({
  button: 0,
  shiftKey: false,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  ...modifiers,
});

suite('Canvas keymap', () => {
  test('puts a node clicked with Shift in the selection or takes it out, as Excalidraw, tldraw and Figma do, and with Mod alike, a click alone selecting it alone', () => {
    const mod =
      process.platform === 'darwin' ? { metaKey: true } : { ctrlKey: true };
    assert.deepStrictEqual(
      [
        clicked(canvasKeymap.select, press({})),
        clicked(canvasKeymap.select, press({ shiftKey: true })),
        clicked(canvasKeymap.select, press(mod)),
      ],
      ['one', 'toggle', 'toggle'],
    );
  });
});

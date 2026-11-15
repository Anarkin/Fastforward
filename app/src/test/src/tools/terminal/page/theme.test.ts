import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  terminalTheme,
  withHiddenCursor,
} from '../../../../../tools/terminal/page/theme';

suite('Terminal theme', () => {
  test('takes the colors of the terminal from the theme, the cursor in the cursor colors of the theme', () => {
    const theme = terminalTheme((color) => `resolved ${color}`);
    assert.deepStrictEqual(
      [theme.background, theme.cursor, theme.cursorAccent, theme.brightWhite],
      [
        'resolved var(--color-terminal-background)',
        'resolved var(--color-cursor)',
        'resolved var(--color-cursor-text)',
        'resolved var(--color-terminal-bright-white)',
      ],
    );
    assert.strictEqual(Object.keys(theme).length, 21);
  });

  test('hides the cursor of xterm.js behind the one the page draws by the color of the background, an opaque one, as xterm.js reads a see-through cursor as white', () => {
    assert.deepStrictEqual(
      withHiddenCursor({
        background: '#111',
        foreground: '#ccc',
        cursor: '#06c',
      }),
      { background: '#111', foreground: '#ccc', cursor: '#111' },
    );
  });
});

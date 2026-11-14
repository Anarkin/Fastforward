import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  terminalFont,
  terminalTheme,
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

  test('takes the monospace font of the theme, falling back to 12 pixels for a size it cannot read', () => {
    assert.deepStrictEqual(terminalFont('Consolas, monospace', '13px'), {
      fontFamily: 'Consolas, monospace',
      fontSize: 13,
    });
    assert.strictEqual(terminalFont('monospace', 'large').fontSize, 12);
  });
});

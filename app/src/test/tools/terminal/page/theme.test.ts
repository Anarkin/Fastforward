import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  terminalFont,
  terminalTheme,
} from '../../../../tools/terminal/page/theme';

suite('Terminal theme', () => {
  test('takes the colors of the terminal from the theme, the cursor in the colors of the text', () => {
    const theme = terminalTheme((color) => `resolved ${color}`);
    assert.deepStrictEqual(
      [theme.background, theme.cursor, theme.cursorAccent, theme.brightWhite],
      [
        'resolved var(--color-terminal-background)',
        'resolved var(--color-terminal-foreground)',
        'resolved var(--color-terminal-background)',
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

import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { createMirror } from '../../../../tools/terminal/main/mirror';

function written(
  mirror: ReturnType<typeof createMirror>,
  data: string,
): Promise<void> {
  return new Promise((resolve) => mirror.terminal.write(data, resolve));
}

suite('Terminal screen copy', () => {
  test('counts an emoji two cells wide, by the rules of Unicode 11, as the page does', async () => {
    const mirror = createMirror({ columns: 20, rows: 5, scrollback: 10 });
    await written(mirror, '😀x');
    assert.strictEqual(mirror.terminal.buffer.active.cursorX, 3);
    mirror.dispose();
  });

  test('keeps as many lines of scrollback as asked for, and sends them with the screen', async () => {
    const mirror = createMirror({ columns: 20, rows: 3, scrollback: 2 });
    await written(
      mirror,
      Array.from({ length: 10 }, (_, index) => `line ${index}`).join('\r\n'),
    );
    const screen = mirror.serialize();
    assert.ok(!screen.includes('line 4'), screen);
    assert.ok(screen.includes('line 5') && screen.includes('line 9'), screen);
    mirror.scrollback(4);
    await written(mirror, '\r\nline 10\r\nline 11');
    assert.ok(mirror.serialize().includes('line 5'));
    mirror.dispose();
  });
});

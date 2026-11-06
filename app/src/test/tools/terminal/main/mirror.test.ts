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
  test('counts an emoji two cells wide, an emoji joined from several code points or asked for by a selector two as well, by its grapheme clusters, as the page, the viewer and the diff do', async () => {
    const mirror = createMirror({ columns: 20, rows: 5, scrollback: 10 });
    await written(mirror, '😀x👨‍👩‍👧‍👦y⚠️z');
    assert.strictEqual(mirror.terminal.buffer.active.cursorX, 9);
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

  test('sends the colors a program gave the palette with the screen, as Far Manager gives it the colors of the console', async () => {
    const mirror = createMirror({ columns: 20, rows: 3, scrollback: 2 });
    await written(
      mirror,
      '\x1b]4;4;rgb:00/00/80\x1b\\\x1b]4;1;rgb:80/00/00;6;rgb:00/80/80\x07\x1b]4;4;rgb:00/00/81\x1b\\text',
    );
    const screen = mirror.serialize();
    assert.ok(
      screen.startsWith(
        '\x1b]4;4;rgb:00/00/81\x1b\\\x1b]4;1;rgb:80/00/00\x1b\\\x1b]4;6;rgb:00/80/80\x1b\\',
      ),
      JSON.stringify(screen),
    );
    assert.ok(screen.includes('text'));
    mirror.dispose();
  });

  test('sends the default foreground, background and cursor colors a program set with the screen', async () => {
    const mirror = createMirror({ columns: 20, rows: 3, scrollback: 2 });
    await written(
      mirror,
      '\x1b]10;#ffffff;#000080\x1b\\\x1b]12;rgb:ff/ff/00\x07',
    );
    assert.ok(
      mirror
        .serialize()
        .startsWith(
          '\x1b]10;#ffffff\x1b\\\x1b]11;#000080\x1b\\\x1b]12;rgb:ff/ff/00\x1b\\',
        ),
      JSON.stringify(mirror.serialize()),
    );
    mirror.dispose();
  });

  test('forgets the colors a program asked for or restored', async () => {
    const mirror = createMirror({ columns: 20, rows: 3, scrollback: 2 });
    await written(
      mirror,
      '\x1b]4;1;rgb:80/00/00;2;rgb:00/80/00;3;rgb:80/80/00\x1b\\\x1b]4;5;?\x1b\\\x1b]104;2\x1b\\\x1b]10;#ffffff\x1b\\\x1b]11;?\x1b\\\x1b]110\x1b\\',
    );
    assert.ok(
      mirror
        .serialize()
        .startsWith('\x1b]4;1;rgb:80/00/00\x1b\\\x1b]4;3;rgb:80/80/00\x1b\\'),
      JSON.stringify(mirror.serialize()),
    );
    await written(mirror, '\x1b]104\x1b\\');
    assert.ok(!mirror.serialize().includes('\x1b]'), mirror.serialize());
    mirror.dispose();
  });

  test('sends the encoding of the mouse with the screen, as ConPTY reads only SGR mouse reports, which Far Manager asks for', async () => {
    const mirror = createMirror({ columns: 20, rows: 3, scrollback: 2 });
    await written(mirror, '\x1b[?1003;1006h');
    assert.ok(
      mirror.serialize().endsWith('\x1b[?1003h\x1b[?1006h'),
      JSON.stringify(mirror.serialize()),
    );
    await written(mirror, '\x1b[?1016h');
    assert.ok(mirror.serialize().endsWith('\x1b[?1016h'));
    await written(mirror, '\x1b[?1006l');
    assert.ok(mirror.serialize().endsWith('\x1b[?1003h'));
    await written(mirror, '\x1b[?1006h\x1bc');
    assert.ok(!mirror.serialize().includes('\x1b[?10'));
    mirror.dispose();
  });
});

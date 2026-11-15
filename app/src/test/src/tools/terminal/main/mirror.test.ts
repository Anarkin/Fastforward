import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { Terminal } from '@xterm/headless';
import { createMirror } from '../../../../../tools/terminal/main/mirror';

function written(
  mirror: ReturnType<typeof createMirror>,
  data: string,
): Promise<void> {
  return new Promise((resolve) => mirror.terminal.write(data, resolve));
}

async function shownFrom(
  mirror: ReturnType<typeof createMirror>,
  columns: number,
  rows: number,
): Promise<Terminal> {
  const shown = new Terminal({
    cols: columns,
    rows,
    scrollback: 10,
    allowProposedApi: true,
  });
  await new Promise<void>((resolve) =>
    shown.write(mirror.serialize(), resolve),
  );
  return shown;
}

const rowsOf = (terminal: Terminal) =>
  Array.from({ length: terminal.rows }, (_, row) =>
    terminal.buffer.active
      .getLine(terminal.buffer.active.baseY + row)
      ?.translateToString(true),
  );

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

  test('sends the cursor a program hid with the screen, as a full-screen program showed a cursor it had hidden once its tab was shown again, until it shows it or the terminal is reset', async () => {
    const mirror = createMirror({ columns: 20, rows: 3, scrollback: 2 });
    await written(mirror, '\x1b[?1049h\x1b[?25l');
    assert.ok(
      mirror.serialize().endsWith('\x1b[?25l'),
      JSON.stringify(mirror.serialize()),
    );
    for (const showing of ['\x1b[?25h', '\x1b[!p', '\x1bc']) {
      await written(mirror, `\x1b[?25l${showing}`);
      assert.ok(
        !mirror.serialize().includes('\x1b[?25l'),
        JSON.stringify(showing),
      );
    }
    mirror.dispose();
  });

  test('sends the region a program scrolls with the screen, the cursor where it was in it, so the status line it keeps below the region stays put once its tab is shown again, as the whole screen scrolled until the program drew it again', async () => {
    for (const origin of ['', '\x1b[?6h']) {
      const mirror = createMirror({ columns: 20, rows: 6, scrollback: 10 });
      await written(
        mirror,
        `\x1b[6;1Hstatus\x1b[1;5r${origin}\x1b[5;1Ha\r\nb\r\nc\r\nd\r\ne\r\nf\x1b[3D`,
      );
      const shown = await shownFrom(mirror, 20, 6);
      assert.deepStrictEqual(
        [shown.buffer.active.cursorX, shown.buffer.active.cursorY],
        [
          mirror.terminal.buffer.active.cursorX,
          mirror.terminal.buffer.active.cursorY,
        ],
        JSON.stringify(origin),
      );
      await new Promise<void>((resolve) => shown.write('\r\ng\r\nh', resolve));
      assert.deepStrictEqual(
        rowsOf(shown),
        ['d', 'e', 'f', 'g', 'h', 'status'],
        JSON.stringify(origin),
      );
      shown.dispose();
      mirror.dispose();
    }
  });

  test('sends no region once a program scrolls the whole screen again, resets the terminal or leaves the screen of its own it set it in, or the terminal is resized, as each of these scrolls the whole screen', async () => {
    const leaving: ((mirror: ReturnType<typeof createMirror>) => unknown)[] = [
      (mirror) => written(mirror, '\x1b[r'),
      (mirror) => written(mirror, '\x1b[1;6r'),
      (mirror) => written(mirror, '\x1b[!p'),
      (mirror) => written(mirror, '\x1bc'),
      (mirror) => mirror.terminal.resize(20, 7),
      (mirror) => mirror.terminal.resize(21, 6),
    ];
    for (const [index, leave] of leaving.entries()) {
      const mirror = createMirror({ columns: 20, rows: 6, scrollback: 10 });
      await written(mirror, '\x1b[2;5r');
      await leave(mirror);
      const screen = mirror.serialize();
      assert.ok(
        !screen.includes('\x1b[2;5r') && !screen.includes('\x1b[1;6r'),
        `${index} ${JSON.stringify(screen)}`,
      );
      mirror.dispose();
    }
    const mirror = createMirror({ columns: 20, rows: 6, scrollback: 10 });
    await written(mirror, '\x1b[?1049h\x1b[2;5r');
    assert.ok(mirror.serialize().includes('\x1b[2;5r'));
    await written(mirror, '\x1b[?1049l');
    assert.ok(!mirror.serialize().includes('\x1b[2;5r'));
    await written(mirror, '\x1b[3;4r\x1b[3;9r\x1b[4;3r');
    assert.ok(mirror.serialize().includes('\x1b[3;6r'));
    mirror.dispose();
  });

  test('sends the shape and blinking a program gave the cursor with the screen, as vim in insert mode got the block of the settings back once its tab was shown again, until it asks for those of the settings or the terminal is reset', async () => {
    const mirror = createMirror({ columns: 20, rows: 3, scrollback: 2 });
    await written(mirror, '\x1b[6 q');
    assert.ok(
      mirror.serialize().endsWith('\x1b[6 q'),
      JSON.stringify(mirror.serialize()),
    );
    await written(mirror, '\x1b[7 q');
    assert.ok(mirror.serialize().endsWith('\x1b[5 q'));
    for (const resetting of ['\x1b[0 q', '\x1b[ q', '\x1b[!p', '\x1bc']) {
      await written(mirror, `\x1b[3 q${resetting}`);
      assert.ok(!mirror.serialize().includes(' q'), JSON.stringify(resetting));
    }
    mirror.dispose();
  });
});

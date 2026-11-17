import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { createMirror } from '../../../../../tools/terminal/main/mirror';

type Mirror = ReturnType<typeof createMirror>;

function written(mirror: Mirror, data: string): Promise<void> {
  return new Promise((resolve) => mirror.terminal.write(data, resolve));
}

const lines = (from: number, count: number) =>
  Array.from({ length: count }, (_, index) => `\r\nline ${from + index}`).join(
    '',
  );

const textAt = (mirror: Mirror, line: number) =>
  mirror.terminal.buffer.active.getLine(line)?.translateToString(true);

suite('Place a terminal tab was left at', () => {
  test('keeps the line a tab was scrolled back to while the shell prints, so it shows the same lines once shown again, and the end of the output when it was left at the end', async () => {
    const mirror = createMirror({ columns: 20, rows: 5, scrollback: 100 });
    await written(mirror, `line 0${lines(1, 29)}`);
    mirror.place.scrolled(10);
    await written(mirror, lines(30, 10));
    assert.strictEqual(mirror.place.place().top, 10);
    assert.strictEqual(textAt(mirror, 10), 'line 10');
    mirror.place.scrolled(undefined);
    await written(mirror, lines(40, 10));
    assert.strictEqual(mirror.place.place().top, undefined);
    mirror.dispose();
  });

  test('follows the line a tab was scrolled back to as older lines leave the history, and keeps the top of the history once that line leaves it too, as xterm.js does while the tab is shown', async () => {
    const mirror = createMirror({ columns: 20, rows: 5, scrollback: 20 });
    await written(mirror, `line 0${lines(1, 29)}`);
    mirror.place.scrolled(10);
    const read = textAt(mirror, 10);
    await written(mirror, lines(30, 3));
    assert.strictEqual(mirror.place.place().top, 7);
    assert.strictEqual(textAt(mirror, 7), read);
    await written(mirror, lines(33, 20));
    assert.strictEqual(mirror.place.place().top, 0);
    mirror.dispose();
  });

  test('forgets the line once a program shows a screen of its own or resets the terminal, as the page then shows the end of the output', async () => {
    for (const leaving of ['\x1b[?1049h', '\x1bc']) {
      const mirror = createMirror({ columns: 20, rows: 5, scrollback: 100 });
      await written(mirror, `line 0${lines(1, 29)}`);
      mirror.place.scrolled(10);
      await written(mirror, leaving);
      assert.strictEqual(
        mirror.place.place().top,
        undefined,
        JSON.stringify(leaving),
      );
      mirror.dispose();
    }
  });

  test('keeps the text selected in a tab while the shell prints, moving it up as older lines leave the history and from the start of the history once its first line leaves, and dropping it once its last line leaves too, as xterm.js does while the tab is shown', async () => {
    const mirror = createMirror({ columns: 20, rows: 5, scrollback: 20 });
    await written(mirror, `line 0${lines(1, 29)}`);
    mirror.place.selected({ start: { x: 2, y: 3 }, end: { x: 4, y: 6 } });
    await written(mirror, lines(30, 2));
    assert.deepStrictEqual(mirror.place.place().selection, {
      start: { x: 2, y: 1 },
      end: { x: 4, y: 4 },
    });
    await written(mirror, lines(32, 2));
    assert.deepStrictEqual(mirror.place.place().selection, {
      start: { x: 0, y: 0 },
      end: { x: 4, y: 2 },
    });
    await written(mirror, lines(34, 3));
    assert.strictEqual(mirror.place.place().selection, undefined);
    mirror.dispose();
  });

  test('drops the text selected once a program shows a screen of its own or leaves it, the terminal is reset or gets another number of rows, as xterm.js does while the tab is shown, and keeps it on another number of columns', async () => {
    const selection = { start: { x: 0, y: 1 }, end: { x: 3, y: 2 } };
    const dropping: ((mirror: Mirror) => Promise<void>)[] = [
      (mirror) => written(mirror, '\x1b[?1049h'),
      async (mirror) => {
        await written(mirror, '\x1b[?1049h');
        mirror.place.selected(selection);
        await written(mirror, '\x1b[?1049l');
      },
      (mirror) => written(mirror, '\x1bc'),
      async (mirror) => mirror.terminal.resize(20, 6),
    ];
    for (const [index, drop] of dropping.entries()) {
      const mirror = createMirror({ columns: 20, rows: 5, scrollback: 100 });
      await written(mirror, `line 0${lines(1, 9)}`);
      mirror.place.selected(selection);
      await drop(mirror);
      assert.strictEqual(
        mirror.place.place().selection,
        undefined,
        String(index),
      );
      mirror.dispose();
    }
    const mirror = createMirror({ columns: 20, rows: 5, scrollback: 100 });
    await written(mirror, `line 0${lines(1, 9)}`);
    mirror.place.selected(selection);
    mirror.terminal.resize(30, 5);
    assert.deepStrictEqual(mirror.place.place().selection, selection);
    mirror.dispose();
  });

  test('keeps the lines and columns a page tells within the history, as the page is not trusted', async () => {
    const mirror = createMirror({ columns: 20, rows: 5, scrollback: 100 });
    await written(mirror, `line 0${lines(1, 9)}`);
    mirror.place.scrolled(1_000_000);
    mirror.place.selected({
      start: { x: 50, y: 2 },
      end: { x: 70, y: 1_000_000 },
    });
    assert.deepStrictEqual(mirror.place.place(), {
      top: 9,
      selection: { start: { x: 20, y: 2 }, end: { x: 20, y: 9 } },
    });
    mirror.dispose();
  });
});

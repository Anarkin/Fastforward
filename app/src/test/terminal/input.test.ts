import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  interrupts,
  TerminalReader,
  type TerminalInput,
} from '../../terminal/input';

function read(...chunks: string[]): TerminalInput[] {
  const reader = new TerminalReader();
  return chunks.flatMap((chunk) => reader.read(chunk));
}

suite('Terminal input', () => {
  test('types each printable character as text, whatever its script', () => {
    assert.deepStrictEqual(read('aé𝄞'), [
      { kind: 'text', text: 'a' },
      { kind: 'text', text: 'é' },
      { kind: 'text', text: '𝄞' },
    ]);
  });

  test('reads Enter, Tab, Backspace and a lone Escape as keys', () => {
    assert.deepStrictEqual(read('\r\t\x7f', '\x1b'), [
      { kind: 'key', key: 'Enter', modifiers: [] },
      { kind: 'key', key: 'Tab', modifiers: [] },
      { kind: 'key', key: 'Backspace', modifiers: [] },
      { kind: 'key', key: 'Escape', modifiers: [] },
    ]);
  });

  test('reads control characters as Ctrl with a letter, Ctrl+Space or Ctrl+Backspace', () => {
    assert.deepStrictEqual(read('\x01\x1a\x00\x08'), [
      { kind: 'key', key: 'a', modifiers: ['control'] },
      { kind: 'key', key: 'z', modifiers: ['control'] },
      { kind: 'key', key: 'Space', modifiers: ['control'] },
      { kind: 'key', key: 'Backspace', modifiers: ['control'] },
    ]);
  });

  test('reads Escape before a character as Alt with it, and Shift for a capital', () => {
    assert.deepStrictEqual(read('\x1bf\x1bF\x1b.'), [
      { kind: 'key', key: 'f', modifiers: ['alt'] },
      { kind: 'key', key: 'f', modifiers: ['shift', 'alt'] },
      { kind: 'key', key: '.', modifiers: ['alt'] },
    ]);
  });

  test('reads the arrows, Home and End, in either cursor mode and with modifiers', () => {
    assert.deepStrictEqual(
      read('\x1b[A\x1bOB\x1b[1;5C\x1b[1;2D\x1b[1;3H\x1b[F\x1b[Z'),
      [
        { kind: 'key', key: 'Up', modifiers: [] },
        { kind: 'key', key: 'Down', modifiers: [] },
        { kind: 'key', key: 'Right', modifiers: ['control'] },
        { kind: 'key', key: 'Left', modifiers: ['shift'] },
        { kind: 'key', key: 'Home', modifiers: ['alt'] },
        { kind: 'key', key: 'End', modifiers: [] },
        { kind: 'key', key: 'Tab', modifiers: ['shift'] },
      ],
    );
  });

  test('reads the keys sent as numbers ending in a tilde, and the function keys', () => {
    assert.deepStrictEqual(
      read('\x1b[5~\x1b[6~\x1b[2~\x1b[3;5~\x1bOP\x1b[1;2S\x1b[15~\x1b[24~'),
      [
        { kind: 'key', key: 'PageUp', modifiers: [] },
        { kind: 'key', key: 'PageDown', modifiers: [] },
        { kind: 'key', key: 'Insert', modifiers: [] },
        { kind: 'key', key: 'Delete', modifiers: ['control'] },
        { kind: 'key', key: 'F1', modifiers: [] },
        { kind: 'key', key: 'F4', modifiers: ['shift'] },
        { kind: 'key', key: 'F5', modifiers: [] },
        { kind: 'key', key: 'F12', modifiers: [] },
      ],
    );
  });

  test('reads mouse presses, releases and moves, with the button held and the modifiers', () => {
    assert.deepStrictEqual(
      read(
        '\x1b[<0;10;5M\x1b[<0;10;5m\x1b[<35;11;5M\x1b[<32;12;6M\x1b[<2;3;4M\x1b[<16;1;2M',
      ),
      [
        {
          kind: 'mouse',
          action: 'press',
          button: 'left',
          x: 10,
          y: 5,
          modifiers: [],
        },
        {
          kind: 'mouse',
          action: 'release',
          button: 'left',
          x: 10,
          y: 5,
          modifiers: [],
        },
        {
          kind: 'mouse',
          action: 'move',
          button: undefined,
          x: 11,
          y: 5,
          modifiers: [],
        },
        {
          kind: 'mouse',
          action: 'move',
          button: 'left',
          x: 12,
          y: 6,
          modifiers: [],
        },
        {
          kind: 'mouse',
          action: 'press',
          button: 'right',
          x: 3,
          y: 4,
          modifiers: [],
        },
        {
          kind: 'mouse',
          action: 'press',
          button: 'left',
          x: 1,
          y: 2,
          modifiers: ['control'],
        },
      ],
    );
  });

  test('reads the wheel turning each way', () => {
    assert.deepStrictEqual(read('\x1b[<64;1;2M\x1b[<65;1;2M\x1b[<69;3;4M'), [
      { kind: 'wheel', direction: 'up', x: 1, y: 2, modifiers: [] },
      { kind: 'wheel', direction: 'down', x: 1, y: 2, modifiers: [] },
      { kind: 'wheel', direction: 'down', x: 3, y: 4, modifiers: ['shift'] },
    ]);
  });

  test('reads what the terminal reports of its size, its attributes and its modes', () => {
    assert.deepStrictEqual(
      read(
        '\x1b[4;700;1200t\x1b[6;20;10t\x1b[8;35;120t\x1b[?61;4;6c\x1b[?1016;1$y',
      ),
      [
        { kind: 'size', of: 'window', height: 700, width: 1200 },
        { kind: 'size', of: 'cell', height: 20, width: 10 },
        { kind: 'size', of: 'characters', height: 35, width: 120 },
        { kind: 'attributes', values: [61, 4, 6] },
        { kind: 'mode', mode: 1016, state: 1 },
      ],
    );
  });

  test('waits for the rest of a sequence split between reads', () => {
    const reader = new TerminalReader();
    assert.deepStrictEqual(reader.read('\x1b[<0;1'), []);
    assert.deepStrictEqual(reader.read(';2Mx'), [
      {
        kind: 'mouse',
        action: 'press',
        button: 'left',
        x: 1,
        y: 2,
        modifiers: [],
      },
      { kind: 'text', text: 'x' },
    ]);
  });

  test('reads pasted text whole, keeping its line breaks, even when split between reads', () => {
    assert.deepStrictEqual(read('\x1b[200~one\r\n', 'two\x1b[2', '01~a'), [
      { kind: 'paste', text: 'one\r\ntwo' },
      { kind: 'text', text: 'a' },
    ]);
  });

  test('skips the sequences it does not know', () => {
    assert.deepStrictEqual(read('\x1b[I\x1b[O\x1b[99~b'), [
      { kind: 'text', text: 'b' },
    ]);
  });

  test('takes Ctrl+C alone as the way out, as a terminal app is left with it', () => {
    const [controlC, c, altC] = read('cc');
    assert.strictEqual(interrupts(controlC), true);
    assert.strictEqual(interrupts(c), false);
    assert.strictEqual(interrupts(altC), false);
    assert.strictEqual(
      interrupts({ kind: 'key', key: 'c', modifiers: ['shift', 'control'] }),
      false,
    );
  });
});

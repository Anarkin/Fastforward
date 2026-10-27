import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import type { TerminalInput } from '../../terminal/input';
import {
  cellAligned,
  FrameWriter,
  pageSizeOf,
  SizeProbe,
  stretched,
  stretchedRegion,
  stretchOf,
  type Frame,
} from '../../terminal/screen';

const cell = { width: 10, height: 20 };

function frameOf(width: number, height: number): Frame {
  return { pixels: new Uint8Array(width * height * 4), width, height };
}

function probed(...inputs: TerminalInput[]) {
  const probe = new SizeProbe();
  const done = inputs.map((input) => probe.take(input));
  return { done, probe };
}

suite('Terminal screen', () => {
  test('grows a changed area out to the cells it touches, inside the frame', () => {
    assert.deepStrictEqual(
      cellAligned({ x: 15, y: 25, width: 10, height: 10 }, cell, {
        width: 100,
        height: 50,
      }),
      { x: 10, y: 20, width: 20, height: 20 },
    );
    assert.deepStrictEqual(
      cellAligned({ x: 95, y: 45, width: 20, height: 20 }, cell, {
        width: 100,
        height: 50,
      }),
      { x: 90, y: 40, width: 10, height: 10 },
    );
  });

  test('sizes the page to the whole cells of the terminal, leaving its last row so a picture there scrolls nothing', () => {
    assert.deepStrictEqual(
      pageSizeOf({
        cell,
        characters: { width: 120, height: 35 },
        sixel: true,
        pixelMouse: false,
      }),
      { width: 1200, height: 680 },
    );
  });

  test('narrows the page by the stretch the terminal puts on it, so it comes out in its shape', () => {
    assert.deepStrictEqual(
      pageSizeOf(
        {
          cell,
          characters: { width: 120, height: 35 },
          sixel: true,
          pixelMouse: false,
        },
        1.25,
      ),
      { width: 960, height: 680 },
    );
  });

  test('stretches nothing where the terminal reports the real size of its cells', () => {
    assert.strictEqual(stretchOf({ width: 9, height: 19 }, undefined), 1);
    assert.strictEqual(stretchOf({ width: 9, height: 19 }, 0.44), 1);
  });

  test('stretches the page as wide as the terminal will squeeze it where the cells it reports are the 10 by 20 it scales every picture from', () => {
    assert.strictEqual(stretchOf(cell, 0.4), 1.25);
    assert.strictEqual(stretchOf(cell, undefined), 1);
    assert.strictEqual(stretchOf(cell, 0), 1);
  });

  test('stretches a frame sideways, blending the pixels between the ones it has', () => {
    const frame: Frame = {
      pixels: new Uint8Array([0, 0, 0, 255, 200, 100, 40, 255]),
      width: 2,
      height: 1,
    };
    assert.deepStrictEqual(
      Array.from(stretched(frame, 4).pixels),
      [
        [0, 0, 0, 255],
        [50, 25, 10, 255],
        [150, 75, 30, 255],
        [200, 100, 40, 255],
      ].flat(),
    );
    assert.strictEqual(stretched(frame, 2), frame);
  });

  test('stretches a changed area out to every pixel it lands on', () => {
    assert.deepStrictEqual(
      stretchedRegion({ x: 3, y: 5, width: 2, height: 7 }, 1.5),
      { x: 4, y: 5, width: 4, height: 7 },
    );
  });

  test('learns the size of the cells and the screen, whether pixel mouse reports and sixels work, once the attributes come, which come last', () => {
    const { done, probe } = probed(
      { kind: 'size', of: 'cell', height: 20, width: 10 },
      { kind: 'size', of: 'characters', height: 35, width: 120 },
      { kind: 'mode', mode: 1016, state: 2 },
      { kind: 'attributes', values: [61, 4, 6] },
    );
    assert.deepStrictEqual(done, [false, false, false, true]);
    assert.deepStrictEqual(probe.size({ width: 80, height: 24 }), {
      cell,
      characters: { width: 120, height: 35 },
      sixel: true,
      pixelMouse: true,
    });
  });

  test('works the cells out from the window when the terminal reports no cell size, and takes the characters it was told when it reports none', () => {
    const { probe } = probed(
      { kind: 'size', of: 'window', height: 480, width: 800 },
      { kind: 'mode', mode: 1016, state: 0 },
      { kind: 'attributes', values: [62] },
    );
    assert.deepStrictEqual(probe.size({ width: 80, height: 24 }), {
      cell,
      characters: { width: 80, height: 24 },
      sixel: false,
      pixelMouse: false,
    });
  });

  test('knows no size when the terminal reports no pixels at all', () => {
    const { probe } = probed({ kind: 'attributes', values: [61, 4] });
    assert.strictEqual(probe.size({ width: 80, height: 24 }), undefined);
  });

  test('writes the changed cells at their place on the screen, one frame at a time, joining the changes made while one is written', () => {
    const written: string[] = [];
    const finishes: (() => void)[] = [];
    const frames = new FrameWriter((text, done) => {
      written.push(text);
      finishes.push(done);
    }, cell);
    const frame = frameOf(100, 60);
    frames.paint({ x: 10, y: 20, width: 10, height: 20 }, () => frame);
    frames.paint({ x: 50, y: 40, width: 10, height: 20 }, () => frame);
    frames.paint({ x: 30, y: 0, width: 10, height: 20 }, () => frame);
    assert.strictEqual(written.length, 1);
    assert.ok(written[0].startsWith('\x1b[2;2H\x1bP0;1;0q"1;1;10;20'));
    finishes[0]();
    assert.strictEqual(written.length, 2);
    assert.ok(written[1].startsWith('\x1b[1;4H\x1bP0;1;0q"1;1;30;60'));
    finishes[1]();
    assert.strictEqual(written.length, 2);
  });

  test('draws the whole frame again in cells of a new size when asked to', () => {
    const written: string[] = [];
    const frames = new FrameWriter((text, done) => {
      written.push(text);
      done();
    }, cell);
    frames.paint({ x: 0, y: 0, width: 10, height: 20 }, () => frameOf(40, 40));
    frames.redraw({ width: 8, height: 16 });
    frames.paint({ x: 9, y: 17, width: 1, height: 1 }, () => frameOf(40, 40));
    assert.ok(written[1].startsWith('\x1b[1;1H\x1bP0;1;0q"1;1;40;40'));
    assert.ok(written[2].startsWith('\x1b[2;2H\x1bP0;1;0q"1;1;8;16'));
  });
});

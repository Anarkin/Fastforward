import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  appIconColors,
  appIconDrawing,
  folderBackOutline,
} from '../../../../shell/page/appIconDrawing';
import { OpeningFrames } from '../../../../shell/page/openingFrames';
import type {
  FromOpeningWorker,
  OpeningContext,
  OpeningPixels,
} from '../../../../shell/page/openingMessages';
import { openingTimes } from '../../../../shell/page/openingMotion';

interface Drawn {
  readonly call: string;
  readonly args: readonly unknown[];
  readonly fill: unknown;
  readonly alpha: number;
}

function fakeContext(): { context: OpeningContext; drawn: Drawn[] } {
  const drawn: Drawn[] = [];
  const context: OpeningContext = {
    canvas: { width: 300, height: 150 },
    globalAlpha: 1,
    fillStyle: '#000000',
    setTransform: (...args) => record('setTransform', args),
    clearRect: (...args) => record('clearRect', args),
    save: () => record('save', []),
    restore: () => record('restore', []),
    translate: (...args) => record('translate', args),
    beginPath: () => record('beginPath', []),
    arc: (...args) => record('arc', args),
    clip: () => record('clip', []),
    fillRect: (...args) => record('fillRect', args),
    fill: (path) => record('fill', [path]),
  };
  function record(call: string, args: readonly unknown[]): void {
    drawn.push({
      call,
      args,
      fill: context.fillStyle,
      alpha: context.globalAlpha,
    });
  }
  return { context, drawn };
}

const pixels: OpeningPixels = {
  width: 800,
  height: 500,
  pixelWidth: 1000,
  pixelHeight: 625,
};

function started(context: OpeningContext | null) {
  let now = 1000;
  const frames: (() => void)[] = [];
  const posted: FromOpeningWorker[] = [];
  const opening = new OpeningFrames({
    now: () => now,
    frame: (run) => frames.push(run),
    outline: (path) => ({ path }),
    post: (message) => posted.push(message),
  });
  opening.receive({
    type: 'start',
    canvas: { getContext: () => context },
    startedAt: 1000,
    pixels,
  });
  return {
    opening,
    posted,
    frames,
    at: (elapsed: number) => {
      now = 1000 + elapsed;
      const run = frames.shift();
      assert.ok(run, `no frame was asked for at ${elapsed} ms`);
      run();
    },
  };
}

suite('Opening frames', () => {
  test('sizes the canvas to the device pixels of the window, and again as the window is resized', () => {
    const { context } = fakeContext();
    const { opening } = started(context);
    assert.deepStrictEqual(context.canvas, { width: 1000, height: 625 });
    opening.receive({
      type: 'resize',
      pixels: { ...pixels, pixelWidth: 1500, pixelHeight: 900 },
    });
    assert.deepStrictEqual(context.canvas, { width: 1500, height: 900 });
  });

  test('draws the disc of the icon, its sky, the back of its folder and its front, each frame on a canvas cleared first', () => {
    const { context, drawn } = fakeContext();
    const { at } = started(context);
    at(openingTimes.pulledBack);
    assert.deepStrictEqual(
      drawn.map(({ call }) => call),
      [
        'setTransform',
        'clearRect',
        'save',
        'translate',
        'beginPath',
        'arc',
        'clip',
        'fillRect',
        'fill',
        'fillRect',
        'restore',
      ],
    );
    assert.deepStrictEqual(drawn[1]?.args, [0, 0, 1000, 625]);
    const size = Math.round((500 / 4) * 1.25);
    const drawing = appIconDrawing(size);
    assert.deepStrictEqual(drawn[3]?.args, [500 - size / 2, 312.5 - size / 2]);
    assert.deepStrictEqual(drawn[5]?.args, [
      size / 2,
      size / 2,
      size / 2,
      0,
      2 * Math.PI,
    ]);
    assert.deepStrictEqual(
      drawn
        .filter(({ call }) => call === 'fillRect' || call === 'fill')
        .map(({ fill, args }) => [fill, args]),
      [
        [appIconColors.sky, [0, 0, size, size]],
        [appIconColors.back, [{ path: folderBackOutline(drawing) }]],
        [
          appIconColors.front,
          [0, drawing.frontTop, size, size - drawing.frontTop],
        ],
      ],
    );
  });

  test('asks for frame after frame until the opening has ended, then says it is done once, asking for none more', () => {
    const { context } = fakeContext();
    const { at, frames, posted } = started(context);
    for (const elapsed of [0, 16, 400, 900, openingTimes.ended - 1]) {
      at(elapsed);
      assert.deepStrictEqual(posted, [], `done at ${elapsed} ms`);
    }
    at(openingTimes.ended);
    assert.deepStrictEqual(posted, [{ type: 'done' }]);
    assert.deepStrictEqual(frames, []);
  });

  test('lands the icon on the whole device pixels the icon of the title bar is drawn on, its sides rounded as that icon rounds them', () => {
    const { context, drawn } = fakeContext();
    const { opening, at } = started(context);
    opening.receive({
      type: 'land',
      landing: { x: 24.3, y: 19.1, size: 20 },
    });
    at(openingTimes.ended);
    const size = Math.round(20 * 1.25);
    const drawing = appIconDrawing(size);
    assert.deepStrictEqual(
      drawn.find(({ call }) => call === 'translate')?.args,
      [Math.round(24.3 * 1.25 - size / 2), Math.round(19.1 * 1.25 - size / 2)],
    );
    assert.deepStrictEqual(drawn.find(({ call }) => call === 'fill')?.args, [
      { path: folderBackOutline(drawing) },
    ]);
  });

  test('clears the canvas and draws nothing once the logo has faded away, having had nowhere to land', () => {
    const { context, drawn } = fakeContext();
    const { at } = started(context);
    at(openingTimes.ended);
    assert.deepStrictEqual(
      drawn.map(({ call }) => call),
      ['setTransform', 'clearRect'],
    );
  });

  test('draws the logo at its opacity as it fades', () => {
    const { context, drawn } = fakeContext();
    const { at } = started(context);
    at((openingTimes.leaving + openingTimes.ended) / 2);
    const alpha = drawn.find(({ call }) => call === 'fillRect')?.alpha ?? 1;
    assert.ok(alpha > 0 && alpha < 1, String(alpha));
  });

  test('says it is done at once when the canvas gives it nothing to draw with, so the page ends the opening rather than wait for it', () => {
    const { posted, frames } = started(null);
    assert.deepStrictEqual(posted, [{ type: 'done' }]);
    assert.deepStrictEqual(frames, []);
  });
});

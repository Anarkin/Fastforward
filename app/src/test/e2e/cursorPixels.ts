import * as assert from 'node:assert';
import type { ElectronApplication, Locator } from 'playwright-core';
import {
  cursorBox,
  pixelBox,
  type Box,
  type CursorBox,
  type CursorShape,
} from '../../lib/page/cursor';
import { waitFor } from '../helpers/fixtures';

export const cursorWidth = 2;

export interface Shot {
  readonly width: number;
  readonly pixels: Buffer;
}

export type Rgb = readonly [number, number, number];

export function pixelAt(taken: Shot, x: number, y: number): Rgb {
  const at = (y * taken.width + x) * 4;
  return [taken.pixels[at], taken.pixels[at + 1], taken.pixels[at + 2]];
}

const sameColor = (a: Rgb, b: Rgb) =>
  a.every((value, channel) => Math.abs(value - b[channel]) <= 2);

export const sortedColor = (color: Rgb) => [...color].toSorted((a, b) => a - b);

function isDark(taken: Shot, x: number, y: number): boolean {
  const at = (y * taken.width + x) * 4;
  return (
    (taken.pixels[at] + taken.pixels[at + 1] + taken.pixels[at + 2]) / 3 < 128
  );
}

function darkBox(taken: Shot, area: Box): Box | undefined {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (let y = area.top; y < area.top + area.height; y++) {
    for (let x = area.left; x < area.left + area.width; x++) {
      if (isDark(taken, x, y)) {
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x + 1);
        bottom = Math.max(bottom, y + 1);
      }
    }
  }
  return left === Infinity
    ? undefined
    : { left, top, width: right - left, height: bottom - top };
}

export interface Drawn {
  readonly box: CursorBox | undefined;
  readonly strays: number;
  readonly color: Rgb;
}

export function drawnBox(taken: Shot, area: Box, at: Box): Drawn {
  const color = pixelAt(taken, at.left, at.top);
  const background = pixelAt(taken, area.left, area.top);
  const isCursor = (x: number, y: number) =>
    sameColor(pixelAt(taken, x, y), color);
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  let strays = 0;
  for (let y = area.top; y < area.top + area.height; y++) {
    for (let x = area.left; x < area.left + area.width; x++) {
      if (isCursor(x, y)) {
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x + 1);
        bottom = Math.max(bottom, y + 1);
      } else if (!sameColor(pixelAt(taken, x, y), background)) {
        strays++;
      }
    }
  }
  if (left === Infinity || sameColor(color, background)) {
    return { box: undefined, strays, color };
  }
  const runOf = (from: [number, number], step: [number, number]) => {
    let count = 0;
    let [x, y] = from;
    while (isCursor(x, y)) {
      count++;
      x += step[0];
      y += step[1];
    }
    return count;
  };
  const middleX = left + Math.floor((right - left) / 2);
  const middleY = top + Math.floor((bottom - top) / 2);
  return {
    box: {
      left,
      top,
      width: right - left,
      height: bottom - top,
      edges: isCursor(middleX, middleY)
        ? undefined
        : {
            top: runOf([middleX, top], [0, 1]),
            right: runOf([right - 1, middleY], [-1, 0]),
            bottom: runOf([middleX, bottom - 1], [0, -1]),
            left: runOf([left, middleY], [1, 0]),
          },
    },
    strays,
    color,
  };
}

const margin = 3;

export function around(cell: Box): Box {
  return {
    left: cell.left - cell.width,
    top: cell.top - margin,
    width: cell.width * 3,
    height: cell.height + 2 * margin,
  };
}

export function expectedBox(cell: Box, shape: CursorShape, ratio: number) {
  return cursorBox(cell, shape, cursorWidth, ratio);
}

export function assertDrawn(
  taken: Shot,
  area: Box,
  expected: CursorBox,
  what: string,
): Rgb {
  const { box, strays, color } = drawnBox(taken, area, expected);
  assert.deepStrictEqual({ box, strays }, { box: expected, strays: 0 }, what);
  return color;
}

const tenths = (value: number) => Math.round(value * 10) / 10;

function lightness(taken: Shot, x: number, y: number): number {
  const at = (y * taken.width + x) * 4;
  return (taken.pixels[at] + taken.pixels[at + 1] + taken.pixels[at + 2]) / 3;
}

export interface GlyphPlace {
  readonly box: Box | undefined;
  readonly middle: readonly [number, number];
}

const sidesOf = (box: Box | undefined) =>
  box === undefined
    ? []
    : [box.left, box.top, box.left + box.width, box.top + box.height];

export function assertSamePlace(
  actual: GlyphPlace,
  expected: GlyphPlace,
  what: string,
): void {
  const [mine, theirs] = [sidesOf(actual.box), sidesOf(expected.box)];
  assert.ok(
    mine.length === 4 &&
      mine.every((edge, side) => Math.abs(edge - (theirs[side] ?? NaN)) <= 1),
    `${what}: ${JSON.stringify([actual.box, expected.box])}`,
  );
  assert.ok(
    actual.middle.every(
      (value, axis) => Math.abs(value - (expected.middle[axis] ?? NaN)) <= 0.25,
    ),
    `${what}: ${JSON.stringify([actual.middle, expected.middle])}`,
  );
}

export function glyphPlace(taken: Shot, cell: Box, dark: boolean): GlyphPlace {
  const values: [number, number, number][] = [];
  for (let y = cell.top; y < cell.top + cell.height; y++) {
    for (let x = cell.left; x < cell.left + cell.width; x++) {
      values.push([x - cell.left, y - cell.top, lightness(taken, x, y)]);
    }
  }
  const all = values.map(([, , value]) => value);
  const low = Math.min(...all);
  const high = Math.max(...all);
  const inks = values.map(
    ([x, y, value]) =>
      [x, y, (dark ? high - value : value - low) / (high - low)] as const,
  );
  const inked = inks.filter(([, , ink]) => ink > 0.5);
  const total = inks.reduce((sum, [, , ink]) => sum + ink, 0);
  const left = Math.min(...inked.map(([x]) => x));
  const top = Math.min(...inked.map(([, y]) => y));
  return {
    box:
      inked.length === 0
        ? undefined
        : {
            left,
            top,
            width: Math.max(...inked.map(([x]) => x)) + 1 - left,
            height: Math.max(...inked.map(([, y]) => y)) + 1 - top,
          },
    middle: [
      tenths(inks.reduce((sum, [x, , ink]) => sum + x * ink, 0) / total),
      tenths(inks.reduce((sum, [, y, ink]) => sum + y * ink, 0) / total),
    ],
  };
}

export function inkRuns(taken: Shot, area: Box): Box[] {
  const columns: boolean[] = [];
  for (let x = area.left; x < area.left + area.width; x++) {
    let dark = false;
    for (let y = area.top; y < area.top + area.height && !dark; y++) {
      dark = isDark(taken, x, y);
    }
    columns.push(dark);
  }
  const runs: Box[] = [];
  let start: number | undefined;
  for (const [index, dark] of [...columns, false].entries()) {
    if (dark && start === undefined) {
      start = index;
    } else if (!dark && start !== undefined) {
      const box = darkBox(taken, {
        left: area.left + start,
        top: area.top,
        width: index - start,
        height: area.height,
      });
      if (box !== undefined) {
        runs.push(box);
      }
      start = undefined;
    }
  }
  return runs;
}

export interface Placed {
  readonly width: number;
  readonly height: number;
  readonly edges: CursorBox['edges'];
  readonly strays: number;
  readonly fromInk: readonly [number, number];
}

export function placedAfterInk(taken: Shot, area: Box): Placed | undefined {
  const [ink, cursor] = inkRuns(taken, area);
  if (ink === undefined || cursor === undefined) {
    return undefined;
  }
  const { box, strays } = drawnBox(
    taken,
    {
      left: cursor.left - 1,
      top: cursor.top - 1,
      width: cursor.width + 2,
      height: cursor.height + 2,
    },
    cursor,
  );
  return box === undefined
    ? undefined
    : {
        width: box.width,
        height: box.height,
        edges: box.edges,
        strays,
        fromInk: [box.left - ink.left, box.top - ink.top],
      };
}

export const blockShown = (taken: Shot, block: Box) =>
  isDark(taken, block.left, block.top) &&
  isDark(taken, block.left + block.width - 1, block.top + block.height - 1);

interface Run {
  readonly start: number;
  readonly length: number;
}

function runAlong(
  taken: Shot,
  x: number,
  y: number,
  [dx, dy]: readonly [number, number],
): Run {
  const color = pixelAt(taken, x, y);
  const same = (at: number) =>
    sameColor(pixelAt(taken, x + at * dx, y + at * dy), color);
  let before = 0;
  while (same(before - 1)) {
    before--;
  }
  let after = 0;
  while (same(after + 1)) {
    after++;
  }
  return {
    start: (dx === 0 ? y : x) + before,
    length: after - before + 1,
  };
}

export function selectedBeside(
  taken: Shot,
  cursor: Box,
  cell: number,
  back: number,
): { readonly selected: unknown; readonly cursor: unknown } {
  const middle = cursor.top + Math.floor(cursor.height / 2);
  const selected = cursor.left - back * cell + Math.floor(cell / 2);
  const cursorRows = runAlong(
    taken,
    cursor.left + Math.floor(cursor.width / 2),
    middle,
    [0, 1],
  );
  const selectionRows = runAlong(taken, selected, middle, [0, 1]);
  const along = runAlong(taken, selected, selectionRows.start, [1, 0]);
  return {
    selected: { rows: selectionRows, endsAt: along.start + along.length },
    cursor: {
      rows: cursorRows,
      endsAt: runAlong(taken, cursor.left, cursorRows.start, [1, 0]).start,
    },
  };
}

export async function elementBox(
  locator: Locator,
  ratio: number,
): Promise<Box> {
  const rect = await locator.evaluate((element) => {
    const { left, top, width, height } = element.getBoundingClientRect();
    return { left, top, width, height };
  });
  return pixelBox(rect, ratio);
}

export async function fitWindow(
  app: ElectronApplication,
  id: number,
): Promise<void> {
  const most = { width: 1360, height: 800 };
  const wanted = await app.evaluate(
    ({ BrowserWindow, screen }, [window, largest]) => {
      const shown = BrowserWindow.fromId(window);
      if (shown === null) {
        throw new Error('The window of the page is gone.');
      }
      const outer = shown.getBounds();
      const inner = shown.getContentBounds();
      const { workArea } = screen.getDisplayMatching(outer);
      const room = {
        width: workArea.width - outer.width + inner.width,
        height: workArea.height - outer.height + inner.height,
      };
      const size = {
        width: Math.min(largest.width, Math.floor(room.width / 8) * 8),
        height: Math.min(largest.height, Math.floor(room.height / 8) * 8),
      };
      shown.setPosition(workArea.x, workArea.y);
      shown.setContentSize(size.width, size.height);
      shown.focus();
      return size;
    },
    [id, most] as const,
  );
  const seen = () =>
    app.evaluate(({ BrowserWindow, screen }, window) => {
      const shown = BrowserWindow.fromId(window);
      return {
        content: shown?.getContentBounds(),
        workArea:
          shown && screen.getDisplayMatching(shown.getBounds()).workArea,
      };
    }, id);
  await waitFor(async () => {
    const { content } = await seen();
    return content?.width === wanted.width && content.height === wanted.height;
  }, `the window to take ${wanted.width} by ${wanted.height}, a size of whole device pixels`).catch(
    async (error: unknown) => {
      throw new Error(`${String(error)}: ${JSON.stringify(await seen())}`);
    },
  );
}

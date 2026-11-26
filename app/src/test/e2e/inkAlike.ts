import { createHash } from 'node:crypto';
import type { ElectronApplication, Page } from 'playwright-core';

const edgeLevels = 16;

const halfUp = 0.01;

export const mostUnlike = 0.01;

export const leastInk = 2000;

export interface Seen {
  readonly brightness: Float32Array;
  readonly width: number;
  readonly inked: number;
  readonly hash: string;
  readonly phase: number;
}

export interface Box {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

function blurredBrightness(
  pixels: Buffer,
  width: number,
  box: Box,
): Float32Array {
  const plain = new Float32Array(box.width * box.height);
  for (let y = 0; y < box.height; y++) {
    for (let x = 0; x < box.width; x++) {
      const at = ((box.top + y) * width + box.left + x) * 4;
      plain[y * box.width + x] =
        (pixels[at] + pixels[at + 1] + pixels[at + 2]) / 3;
    }
  }
  const blurred = new Float32Array(plain.length);
  for (let y = 0; y < box.height; y++) {
    for (let x = 1; x < box.width - 1; x++) {
      const at = y * box.width + x;
      blurred[at] = (plain[at - 1] + plain[at] + plain[at + 1]) / 3;
    }
  }
  return blurred;
}

function groundOf(brightness: Float32Array): number {
  const counts = new Map<number, number>();
  for (const value of brightness) {
    const level = Math.round(value);
    counts.set(level, (counts.get(level) ?? 0) + 1);
  }
  return [...counts].toSorted((one, other) => other[1] - one[1])[0]?.[0] ?? 0;
}

function inkedIn(brightness: Float32Array): number {
  const ground = groundOf(brightness);
  return brightness.filter((value) => Math.abs(value - ground) > edgeLevels)
    .length;
}

export function unlikeShare(one: Seen, other: Seen): number {
  let unlike = 0;
  for (let at = 0; at < one.brightness.length; at++) {
    if (Math.abs(one.brightness[at] - other.brightness[at]) > edgeLevels) {
      unlike++;
    }
  }
  return unlike / Math.max(1, one.inked);
}

export async function inkSeen(
  app: ElectronApplication,
  page: Page,
  box: Box,
): Promise<Seen> {
  const png = await page.screenshot();
  const taken = await app.evaluate(({ nativeImage }, encoded) => {
    const image = nativeImage.createFromBuffer(Buffer.from(encoded, 'base64'));
    return {
      width: image.getSize().width,
      pixels: image.toBitmap().toString('base64'),
    };
  }, png.toString('base64'));
  const ratio = taken.width / (await page.evaluate(() => innerWidth));
  const width = Math.round(box.width * ratio);
  const brightness = blurredBrightness(
    Buffer.from(taken.pixels, 'base64'),
    taken.width,
    {
      left: Math.floor(box.left * ratio + halfUp),
      top: Math.floor(box.top * ratio + halfUp),
      width,
      height: Math.round(box.height * ratio),
    },
  );
  const start = box.left * ratio;
  return {
    brightness,
    width,
    phase: Math.round((start - Math.floor(start + halfUp)) * 100) / 100,
    inked: inkedIn(brightness),
    hash: createHash('sha1')
      .update(Buffer.from(brightness.buffer))
      .digest('hex'),
  };
}

const leastCellInk = 200;

const mostCellApart = 0.25;

const reach = 1.5;

function cellInks(seen: Seen, columns: number, rows: number): number[] {
  const ground = groundOf(seen.brightness);
  const height = seen.brightness.length / seen.width;
  const cell = seen.width / columns;
  const inks: number[] = [];
  for (let row = 0; row < rows; row++) {
    const top = Math.round((row * height) / rows);
    const bottom = Math.round(((row + 1) * height) / rows);
    for (let column = 0; column < columns; column++) {
      const middle = (column + 0.5) * cell;
      const left = Math.max(0, Math.floor(middle - reach * cell));
      const right = Math.min(seen.width, Math.ceil(middle + reach * cell));
      let mass = 0;
      for (let x = left; x < right; x++) {
        const weight = Math.max(
          0,
          1 - Math.abs(x + 0.5 - middle) / (reach * cell),
        );
        for (let y = top; y < bottom; y++) {
          mass +=
            weight *
            Math.abs((seen.brightness[y * seen.width + x] ?? ground) - ground);
        }
      }
      inks.push(mass);
    }
  }
  return inks;
}

export function unlikeCells(
  one: Seen,
  other: Seen,
  columns: number,
  rows: number,
): number[] {
  const ones = cellInks(one, columns, rows);
  const others = cellInks(other, columns, rows);
  return ones.flatMap((mass, at) => {
    const twin = others[at] ?? 0;
    const apart = Math.abs(mass - twin);
    return apart > leastCellInk && apart > mostCellApart * Math.max(mass, twin)
      ? [at]
      : [];
  });
}

import {
  type AppIconDrawing,
  appIconColors,
  appIconDrawing,
} from '../../src/shell/page/appIconDrawing.ts';
import type { Picture, Rgb } from './raster.mts';

function rgbOf(hex: string): Rgb {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

const sky = rgbOf(appIconColors.sky);
const back = rgbOf(appIconColors.back);
const front = rgbOf(appIconColors.front);
const plateColor: Rgb = [255, 255, 255];

const plateMargin = 100 / 1024;
const plateCorner = 185 / 824;
const discOnPlate = 750 / 1024;

function curveAt(drawing: AppIconDrawing, x: number): number {
  const { tabEnd, cornerControl, cornerEnd, tabTop } = drawing;
  const a = tabEnd - 2 * cornerControl + cornerEnd.x;
  const b = 2 * (cornerControl - tabEnd);
  const c = tabEnd - x;
  const t =
    Math.abs(a) < 1e-9 ? -c / b : (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
  return tabTop + t * t * (cornerEnd.y - tabTop);
}

function folderTopAt(drawing: AppIconDrawing, x: number): number {
  const { tabTop, tabEnd, cornerEnd, stepEnd, backTop } = drawing;
  if (x <= tabEnd) {
    return tabTop;
  }
  if (x <= cornerEnd.x) {
    return curveAt(drawing, x);
  }
  if (x <= stepEnd) {
    return (
      cornerEnd.y +
      ((x - cornerEnd.x) / (stepEnd - cornerEnd.x)) * (backTop - cornerEnd.y)
    );
  }
  return backTop;
}

export function discPicture(size: number, left = 0, top = 0): Picture {
  const drawing = appIconDrawing(size);
  const radius = size / 2;
  return (x, y) => {
    const across = x - left;
    const down = y - top;
    if ((across - radius) ** 2 + (down - radius) ** 2 > radius * radius) {
      return undefined;
    }
    if (down >= drawing.frontTop) {
      return front;
    }
    return down >= folderTopAt(drawing, across) ? back : sky;
  };
}

export function platePicture(size: number): Picture {
  const margin = Math.round(size * plateMargin);
  const body = size - 2 * margin;
  const corner = body * plateCorner;
  const inset = Math.round((body * (1 - discOnPlate)) / 2);
  const disc = discPicture(body - 2 * inset, margin + inset, margin + inset);
  const nearest = (place: number) =>
    Math.min(Math.max(place, margin + corner), margin + body - corner);
  return (x, y) => {
    if (x < margin || y < margin || x > margin + body || y > margin + body) {
      return undefined;
    }
    if ((x - nearest(x)) ** 2 + (y - nearest(y)) ** 2 > corner * corner) {
      return undefined;
    }
    return disc(x, y) ?? plateColor;
  };
}

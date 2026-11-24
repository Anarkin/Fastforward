import { type PixelBox } from './iconPixels';

export interface FloppyDrawing {
  readonly size: number;
  readonly disk: PixelBox;
  readonly corner: number;
  readonly rounding: number;
  readonly shutter: PixelBox;
  readonly shutterWindow: PixelBox;
  readonly label: PixelBox;
  readonly lines: readonly [PixelBox, PixelBox, PixelBox];
}

const designedSpan = 14;

export function floppyDrawing(size: number): FloppyDrawing {
  const margin = Math.max(1, Math.round(size / 16));
  const span = size - 2 * margin;
  const unit = (units: number) => Math.round((span * units) / designedSpan);
  const thin = Math.max(1, Math.floor(span / 12));
  const corner = unit(3);
  const sideRim = unit(2);
  const labelHeight = Math.max(unit(7), 3 * thin + 4);
  const label = {
    x: margin + sideRim,
    y: margin + span - thin - labelHeight,
    width: span - 2 * sideRim,
    height: labelHeight,
  };
  const blank = labelHeight - 3 * thin;
  const gapBetween = Math.round(blank / 4);
  const gapAbove = Math.floor((blank - 2 * gapBetween) / 2);
  const line = (at: number) => ({
    x: label.x + thin,
    y: label.y + gapAbove + at * (thin + gapBetween),
    width: label.width - 2 * thin,
    height: thin,
  });
  const shutterLeft = margin + unit(3);
  const shutter = {
    x: shutterLeft,
    y: margin,
    width: Math.min(unit(7), margin + span - corner - thin - shutterLeft),
    height: Math.min(unit(5), label.y - thin - margin),
  };
  const windowWidth = unit(2);
  return {
    size,
    disk: { x: margin, y: margin, width: span, height: span },
    corner,
    rounding: thin,
    shutter,
    shutterWindow: {
      x: shutter.x + shutter.width - thin - windowWidth,
      y: shutter.y + thin,
      width: windowWidth,
      height: shutter.height - 2 * thin,
    },
    label,
    lines: [line(0), line(1), line(2)],
  };
}

export function diskOutline({ disk, corner, rounding }: FloppyDrawing): string {
  const left = disk.x;
  const top = disk.y;
  const right = disk.x + disk.width;
  const bottom = disk.y + disk.height;
  const arc = (x: number, y: number) =>
    `A${rounding} ${rounding} 0 0 1 ${x} ${y}`;
  return [
    `M${left + rounding} ${top}`,
    `H${right - corner}`,
    `L${right} ${top + corner}`,
    `V${bottom - rounding}`,
    arc(right - rounding, bottom),
    `H${left + rounding}`,
    arc(left, bottom - rounding),
    `V${top + rounding}`,
    arc(left + rounding, top),
    'Z',
  ].join(' ');
}

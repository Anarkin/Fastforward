import type { PixelBox } from './iconPixels';

export interface PromptDrawing {
  readonly size: number;
  readonly frame: PixelBox;
  readonly rounding: number;
  readonly screen: PixelBox;
  readonly chevron: readonly PixelBox[];
  readonly underscore: PixelBox;
}

const designedSpan = 14;

const oddNear = (length: number) => 2 * Math.round((length - 1) / 2) + 1;

export function promptDrawing(size: number): PromptDrawing {
  const margin = Math.max(1, Math.round(size / 16));
  const span = size - 2 * margin;
  const unit = (units: number) => Math.round((span * units) / designedSpan);
  const thin = Math.max(1, Math.floor(span / 12));
  const chevronHeight = oddNear(span / 2);
  const bottom = size - margin;
  const roughTop = margin + unit(1);
  const top =
    (bottom - roughTop - 2 * thin - chevronHeight) % 2 === 0
      ? roughTop
      : roughTop - 1;
  const frame = { x: margin, y: top, width: span, height: bottom - top };
  const screen = {
    x: frame.x + thin,
    y: frame.y + thin,
    width: frame.width - 2 * thin,
    height: frame.height - 2 * thin,
  };
  const arm = Math.max(2, Math.floor(span / 8));
  const gap = unit(1);
  const underscoreWidth = unit(4);
  const reach = (chevronHeight - 1) / 2;
  const promptWidth = reach + arm + gap + underscoreWidth;
  const left = screen.x + Math.floor((screen.width - promptWidth) / 2);
  const chevronTop = screen.y + (screen.height - chevronHeight) / 2;
  const chevron = Array.from({ length: chevronHeight }, (_, row) => ({
    x: left + Math.min(row, chevronHeight - 1 - row),
    y: chevronTop + row,
    width: arm,
    height: 1,
  }));
  return {
    size,
    frame,
    rounding: thin,
    screen,
    chevron,
    underscore: {
      x: left + reach + arm + gap,
      y: chevronTop + chevronHeight - thin,
      width: underscoreWidth,
      height: thin,
    },
  };
}

export function frameOutline({ frame, rounding }: PromptDrawing): string {
  const left = frame.x;
  const top = frame.y;
  const right = frame.x + frame.width;
  const bottom = frame.y + frame.height;
  const arc = (x: number, y: number) =>
    `A${rounding} ${rounding} 0 0 1 ${x} ${y}`;
  return [
    `M${left + rounding} ${top}`,
    `H${right - rounding}`,
    arc(right, top + rounding),
    `V${bottom - rounding}`,
    arc(right - rounding, bottom),
    `H${left + rounding}`,
    arc(left, bottom - rounding),
    `V${top + rounding}`,
    arc(left + rounding, top),
    'Z',
  ].join(' ');
}

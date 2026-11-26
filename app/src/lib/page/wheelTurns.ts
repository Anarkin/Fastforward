export const onRow = 0.01;
const pixelMode = 0;
const lineMode = 1;
export const pageMode = 2;
const notch = 120;

export interface Wheel {
  readonly deltaY: number;
  readonly deltaMode: number;
  readonly wheelDeltaY?: number;
}

export interface WheelSizes {
  readonly row: number;
  readonly step: number;
  readonly page: number;
  readonly perNotch: number;
}

export function notchesOf({
  deltaY,
  wheelDeltaY = 0,
}: Wheel): number | undefined {
  return deltaY !== 0 && wheelDeltaY !== 0 && wheelDeltaY % notch === 0
    ? (Math.sign(deltaY) * Math.abs(wheelDeltaY)) / notch
    : undefined;
}

export const byPixels = (deltaMode: number): boolean => deltaMode === pixelMode;

export function wheelPixels(
  delta: number,
  deltaMode: number,
  { row, step, page }: Omit<WheelSizes, 'perNotch'>,
): number {
  return deltaMode === lineMode
    ? delta * step
    : deltaMode === pageMode
      ? ((delta * page) / row) * step
      : delta;
}

export function wheelTurn(
  pending: number,
  wheel: Wheel,
  { row, step, page, perNotch }: WheelSizes,
): { readonly rows: number; readonly pending: number } {
  const notches = notchesOf(wheel);
  if (notches !== undefined) {
    return { rows: notches * perNotch, pending: 0 };
  }
  const total =
    pending + wheelPixels(wheel.deltaY, wheel.deltaMode, { row, step, page });
  const rows = Math.trunc(total / step + (total > 0 ? onRow : -onRow));
  const left = total - rows * step;
  return { rows, pending: Math.abs(left) < onRow ? 0 : left };
}

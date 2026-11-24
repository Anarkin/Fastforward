export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface CellReport {
  readonly cell: Size;
  readonly screen: Size;
}

export interface CellGrid {
  readonly cell: Size;
  readonly around: Size;
  readonly scale: number;
}

const mostPixels = 1 << 16;

const pixelsOf = (value: unknown): number | undefined =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= 1 &&
  value < mostPixels
    ? value
    : undefined;

const fieldOf = (value: unknown, key: string): unknown =>
  typeof value === 'object' && value !== null
    ? Reflect.get(value, key)
    : undefined;

function sizeOf(value: unknown): Size | undefined {
  const width = pixelsOf(fieldOf(value, 'width'));
  const height = pixelsOf(fieldOf(value, 'height'));
  return width === undefined || height === undefined
    ? undefined
    : { width, height };
}

export function cellReportOf(value: unknown): CellReport | undefined {
  const cell = sizeOf(fieldOf(value, 'cell'));
  const screen = sizeOf(fieldOf(value, 'screen'));
  return cell === undefined || screen === undefined
    ? undefined
    : { cell, screen };
}

const hair = 1e-9;

export const pagePixels = (client: number, scale: number): number =>
  Math.ceil(Math.ceil(client / scale - hair) * scale - hair);

export function gridAround(
  { cell, screen }: CellReport,
  client: Size,
  scale = 1,
): CellGrid | undefined {
  const around = {
    width: pagePixels(client.width, scale) - screen.width,
    height: pagePixels(client.height, scale) - screen.height,
  };
  return around.width < 0 || around.height < 0
    ? undefined
    : { cell, around, scale };
}

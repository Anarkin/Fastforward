import type { TerminalInput } from './input';
import { sixelOf, type Region } from './sixel';

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface TerminalSize {
  readonly cell: Size;
  readonly characters: Size;
  readonly sixel: boolean;
  readonly pixelMouse: boolean;
}

export interface Frame {
  readonly pixels: Uint8Array;
  readonly width: number;
  readonly height: number;
}

const pixelMouseMode = 1016;
const sixelAttribute = 4;
const recognizedStates = new Set([1, 2, 3]);
const scaledCell: Size = { width: 10, height: 20 };

export const sizeQueries = `\x1b[14t\x1b[16t\x1b[18t\x1b[?${pixelMouseMode}$p\x1b[c`;

export function enterScreen(pixelMouse: boolean): string {
  return [
    '\x1b[?1049h',
    '\x1b[?25l',
    '\x1b[2J',
    '\x1b[?1003h',
    '\x1b[?1006h',
    pixelMouse ? `\x1b[?${pixelMouseMode}h` : '',
    '\x1b[?2004h',
  ].join('');
}

export const leaveScreen = [
  '\x1b[?2004l',
  `\x1b[?${pixelMouseMode}l`,
  '\x1b[?1006l',
  '\x1b[?1003l',
  '\x1b[?25h',
  '\x1b[?1049l',
].join('');

export const clearScreen = '\x1b[2J';

export class SizeProbe {
  private window: Size | undefined;
  private cell: Size | undefined;
  private characters: Size | undefined;
  private pixelMouse = false;
  private sixel = false;

  take(input: TerminalInput): boolean {
    switch (input.kind) {
      case 'size':
        this[input.of] = { width: input.width, height: input.height };
        return false;
      case 'mode':
        if (input.mode === pixelMouseMode) {
          this.pixelMouse = recognizedStates.has(input.state);
        }
        return false;
      case 'attributes':
        this.sixel = input.values.includes(sixelAttribute);
        return true;
      default:
        return false;
    }
  }

  size(told: Size): TerminalSize | undefined {
    const characters = this.characters ?? told;
    const cell =
      this.cell ??
      (this.window === undefined
        ? undefined
        : {
            width: Math.floor(this.window.width / characters.width),
            height: Math.floor(this.window.height / characters.height),
          });
    if (cell === undefined || cell.width === 0 || cell.height === 0) {
      return undefined;
    }
    return {
      cell,
      characters,
      sixel: this.sixel,
      pixelMouse: this.pixelMouse,
    };
  }
}

export function pageSizeOf(terminal: TerminalSize, stretch = 1): Size {
  return {
    width: Math.round(
      (terminal.characters.width * terminal.cell.width) / stretch,
    ),
    height: Math.max(1, terminal.characters.height - 1) * terminal.cell.height,
  };
}

export function stretchOf(
  cell: Size,
  hiddenCellAspect: number | undefined,
): number {
  if (
    hiddenCellAspect === undefined ||
    hiddenCellAspect <= 0 ||
    cell.width !== scaledCell.width ||
    cell.height !== scaledCell.height
  ) {
    return 1;
  }
  return cell.width / cell.height / hiddenCellAspect;
}

export function stretched(frame: Frame, width: number): Frame {
  if (width === frame.width) {
    return frame;
  }
  const scale = frame.width / width;
  const lefts = new Int32Array(width);
  const rights = new Int32Array(width);
  const weights = new Float32Array(width);
  for (let x = 0; x < width; x++) {
    const source = Math.min(
      frame.width - 1,
      Math.max(0, (x + 0.5) * scale - 0.5),
    );
    lefts[x] = Math.floor(source);
    rights[x] = Math.min(frame.width - 1, lefts[x] + 1);
    weights[x] = source - lefts[x];
  }
  const pixels = new Uint8Array(width * frame.height * 4);
  for (let y = 0; y < frame.height; y++) {
    const row = y * frame.width * 4;
    let offset = y * width * 4;
    for (let x = 0; x < width; x++) {
      const left = row + lefts[x] * 4;
      const right = row + rights[x] * 4;
      const weight = weights[x];
      for (let channel = 0; channel < 4; channel++, offset++) {
        pixels[offset] = Math.round(
          frame.pixels[left + channel] * (1 - weight) +
            frame.pixels[right + channel] * weight,
        );
      }
    }
  }
  return { pixels, width, height: frame.height };
}

export function stretchedRegion(region: Region, stretch: number): Region {
  const x = Math.floor(region.x * stretch);
  return {
    x,
    y: region.y,
    width: Math.ceil((region.x + region.width) * stretch) - x,
    height: region.height,
  };
}

export function cellAligned(dirty: Region, cell: Size, frame: Size): Region {
  const x = Math.floor(dirty.x / cell.width) * cell.width;
  const y = Math.floor(dirty.y / cell.height) * cell.height;
  const right = Math.min(
    frame.width,
    Math.ceil((dirty.x + dirty.width) / cell.width) * cell.width,
  );
  const bottom = Math.min(
    frame.height,
    Math.ceil((dirty.y + dirty.height) / cell.height) * cell.height,
  );
  return {
    x,
    y,
    width: Math.max(0, right - x),
    height: Math.max(0, bottom - y),
  };
}

export class FrameWriter {
  private dirty: Region | undefined;
  private latest: (() => Frame) | undefined;
  private writing = false;

  constructor(
    private readonly write: (text: string, done: () => void) => void,
    private cell: Size,
  ) {}

  paint(dirty: Region, frame: () => Frame): void {
    this.dirty = this.dirty === undefined ? dirty : union(this.dirty, dirty);
    this.latest = frame;
    this.flush();
  }

  redraw(cell: Size): void {
    this.cell = cell;
    if (this.latest !== undefined) {
      this.dirty = { x: 0, y: 0, width: Infinity, height: Infinity };
      this.flush();
    }
  }

  private flush(): void {
    if (this.writing || this.dirty === undefined || !this.latest) {
      return;
    }
    const frame = this.latest();
    const region = cellAligned(this.dirty, this.cell, frame);
    this.dirty = undefined;
    if (region.width === 0 || region.height === 0) {
      return;
    }
    this.writing = true;
    const row = region.y / this.cell.height + 1;
    const column = region.x / this.cell.width + 1;
    this.write(
      `\x1b[${row};${column}H${sixelOf(frame.pixels, frame.width, region)}`,
      () => {
        this.writing = false;
        this.flush();
      },
    );
  }
}

function union(a: Region, b: Region): Region {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}

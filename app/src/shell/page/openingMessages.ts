import type { OpeningLanding, OpeningViewport } from './openingMotion';

export interface OpeningPixels extends OpeningViewport {
  readonly pixelWidth: number;
  readonly pixelHeight: number;
}

export interface OpeningContext {
  readonly canvas: { width: number; height: number };
  globalAlpha: number;
  fillStyle: CanvasRenderingContext2D['fillStyle'];
  setTransform(
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ): void;
  clearRect(x: number, y: number, width: number, height: number): void;
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  beginPath(): void;
  arc(
    x: number,
    y: number,
    radius: number,
    startAngle: number,
    endAngle: number,
  ): void;
  clip(): void;
  fillRect(x: number, y: number, width: number, height: number): void;
  fill(path: object): void;
}

interface OpeningCanvas {
  getContext(kind: '2d'): OpeningContext | null;
}

export type ToOpeningWorker =
  | {
      readonly type: 'start';
      readonly canvas: OpeningCanvas;
      readonly startedAt: number;
      readonly pixels: OpeningPixels;
    }
  | { readonly type: 'resize'; readonly pixels: OpeningPixels }
  | { readonly type: 'land'; readonly landing: OpeningLanding };

export interface FromOpeningWorker {
  readonly type: 'done';
}

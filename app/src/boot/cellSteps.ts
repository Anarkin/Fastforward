import { screen, type BrowserWindow } from 'electron';
import {
  gridAround,
  type CellGrid,
  type CellReport,
  type Size,
} from '../shell/shared/cellGrid';
import { fittedSize, type Toward } from './cellFit';
import { fitsWhenMoved, fitToward } from './cellsChanged';
import { windowPixels } from './windowPixels';

export interface CellSteps {
  follow(window: BrowserWindow, report: CellReport | undefined): void;
}

export const resting = (window: BrowserWindow): boolean =>
  !window.isMaximized() && !window.isFullScreen() && !window.isDestroyed();

export function leastClient(
  window: BrowserWindow,
  scale: number,
  frame: Size,
): Size {
  const [width = 0, height = 0] = window.getMinimumSize();
  return {
    width: Math.ceil(width * scale) - frame.width,
    height: Math.ceil(height * scale) - frame.height,
  };
}

export const scaleOf = (window: BrowserWindow): number =>
  screen.getDisplayMatching(window.getBounds()).scaleFactor;

export function electronClient(window: BrowserWindow): Size {
  const scale = screen.getDisplayMatching(window.getBounds()).scaleFactor;
  const [width = 0, height = 0] = window.getContentSize();
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

const toward = fitToward();

export function towardOf(window: BrowserWindow, cell: Size): Toward {
  return toward(window, cell);
}

export function fitByElectron(window: BrowserWindow, grid: CellGrid): void {
  if (!resting(window)) {
    return;
  }
  const scale = screen.getDisplayMatching(window.getBounds()).scaleFactor;
  const pixels = electronClient(window);
  const bounds = window.getBounds();
  const content = window.getContentBounds();
  const fitted = fittedSize(
    pixels,
    grid,
    leastClient(window, scale, {
      width: Math.round((bounds.width - content.width) * scale),
      height: Math.round((bounds.height - content.height) * scale),
    }),
    Number.isInteger(scale) ? scale : 1,
    towardOf(window, grid.cell),
  );
  if (fitted.width !== pixels.width || fitted.height !== pixels.height) {
    windowPixels().sizeClientTo(window, fitted);
  }
}

const fits = fitsWhenMoved();

const byElectron: CellSteps = {
  follow: (window, report) => {
    const grid =
      report === undefined
        ? undefined
        : gridAround(report, electronClient(window), scaleOf(window));
    if (
      report !== undefined &&
      grid !== undefined &&
      fits.due(window, report, electronClient(window))
    ) {
      fitByElectron(window, grid);
      fits.done(window, report, electronClient(window));
    }
  },
};

let current = byElectron;

const loaded: Partial<
  Record<NodeJS.Platform, () => Promise<CellSteps | undefined>>
> = {
  win32: () =>
    import('./windowsCellSteps.js').then(({ windowsCellSteps }) =>
      windowsCellSteps(),
    ),
  darwin: () =>
    import('./macCellSteps.js').then(({ macCellSteps }) => macCellSteps()),
  linux: () =>
    import('./x11CellSteps.js').then(({ x11CellSteps }) => x11CellSteps()),
};

export function prepareCellSteps(platform: NodeJS.Platform): Promise<void> {
  const load = loaded[platform];
  return load === undefined
    ? Promise.resolve()
    : load().then(
        (steps) => {
          current = steps ?? byElectron;
        },
        () => undefined,
      );
}

export function cellSteps(): CellSteps {
  return current;
}

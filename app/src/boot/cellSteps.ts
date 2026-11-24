import { screen, type BrowserWindow } from 'electron';
import {
  gridAround,
  type CellGrid,
  type CellReport,
  type Size,
} from '../shell/shared/cellGrid';
import { fittedSize } from './cellFit';
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

export function electronClient(window: BrowserWindow): Size {
  const scale = screen.getDisplayMatching(window.getBounds()).scaleFactor;
  const [width = 0, height = 0] = window.getContentSize();
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
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
  );
  if (fitted.width !== pixels.width || fitted.height !== pixels.height) {
    windowPixels().sizeClientTo(window, fitted);
  }
}

const fittedGrids = new WeakMap<BrowserWindow, string>();

const byElectron: CellSteps = {
  follow: (window, report) => {
    const key = JSON.stringify(report?.cell);
    const grid =
      report === undefined
        ? undefined
        : gridAround(report, electronClient(window));
    if (grid !== undefined && fittedGrids.get(window) !== key) {
      fittedGrids.set(window, key);
      fitByElectron(window, grid);
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
    process.env.FASTFORWARD_MAC_CELL_STEPS === '1'
      ? import('./macCellSteps.js').then(({ macCellSteps }) => macCellSteps())
      : Promise.resolve(undefined),
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

import { screen, type BrowserWindow } from 'electron';

export interface WindowPixels {
  moveContent(window: BrowserWindow, x: number, y: number): void;
  sizeLike(window: BrowserWindow, source: BrowserWindow): void;
  sizeTo(window: BrowserWindow, size: Size): void;
  sizeClientTo(window: BrowserWindow, pixels: Size): void;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

export function copiesPixels(source: {
  readonly maximized: boolean;
  readonly fullScreen: boolean;
  readonly current: Size;
  readonly normal: Size;
  readonly sourceScale: number;
  readonly windowScale: number;
}): boolean {
  return (
    !source.maximized &&
    !source.fullScreen &&
    Math.abs(source.current.width - source.normal.width) <= 1 &&
    Math.abs(source.current.height - source.normal.height) <= 1 &&
    source.sourceScale === source.windowScale
  );
}

export function pixelsToSize(
  pixels: Size,
  seen: Size,
  wanted: Size,
  scale: number,
): Size {
  return {
    width: pixels.width - Math.round((seen.width - wanted.width) * scale),
    height: pixels.height - Math.round((seen.height - wanted.height) * scale),
  };
}

const byElectron: WindowPixels = {
  moveContent: (window, x, y) => {
    const bounds = window.getBounds();
    const content = window.getContentBounds();
    window.setPosition(x - (content.x - bounds.x), y - (content.y - bounds.y));
  },
  sizeLike: (window, source) => {
    const { width, height } = source.getNormalBounds();
    window.setSize(width, height);
  },
  sizeTo: () => undefined,
  sizeClientTo: (window, pixels) => {
    const { scaleFactor } = screen.getDisplayMatching(window.getBounds());
    window.setContentSize(
      Math.round(pixels.width / scaleFactor),
      Math.round(pixels.height / scaleFactor),
    );
  },
};

let current = byElectron;

export function prepareWindowPixels(platform: NodeJS.Platform): Promise<void> {
  return platform === 'win32'
    ? import('./windowsPixels.js').then(
        ({ windowsPixels }) => {
          current = windowsPixels(byElectron);
        },
        () => undefined,
      )
    : Promise.resolve();
}

export function windowPixels(): WindowPixels {
  return current;
}

import type { BrowserWindow } from 'electron';

export interface WindowPixels {
  moveContent(window: BrowserWindow, x: number, y: number): void;
  sizeLike(window: BrowserWindow, source: BrowserWindow): void;
}

interface Size {
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
};

let current = byElectron;

export function prepareWindowPixels(platform: NodeJS.Platform): void {
  if (platform === 'win32') {
    void import('./windowsPixels.js').then(
      ({ windowsPixels }) => {
        current = windowsPixels(byElectron);
      },
      () => undefined,
    );
  }
}

export function windowPixels(): WindowPixels {
  return current;
}

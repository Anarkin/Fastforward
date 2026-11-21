import type { BrowserWindow } from 'electron';

export interface WindowPixels {
  moveContent(window: BrowserWindow, x: number, y: number): void;
  sizeLike(window: BrowserWindow, source: BrowserWindow): void;
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
    void import('./windowsPixels.js').then(({ windowsPixels }) => {
      current = windowsPixels();
    });
  }
}

export function windowPixels(): WindowPixels {
  return current;
}

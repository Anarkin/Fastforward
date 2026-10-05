import * as path from 'node:path';

export const appScheme = 'fastforward';
export const appOrigin = `${appScheme}://app`;

export function appFile(root: string, url: string): string | undefined {
  const parsed = new URL(url);
  if (!fromApp(parsed)) {
    return undefined;
  }
  const relative = decodeURIComponent(parsed.pathname).replace(/^\/+/, '');
  const file = path.resolve(root, relative || 'index.html');
  const inside = path.relative(root, file);
  return inside && !inside.startsWith('..') && !path.isAbsolute(inside)
    ? file
    : undefined;
}

export function isAppUrl(url: string): boolean {
  const parsed = URL.parse(url);
  return parsed !== null && fromApp(parsed);
}

function fromApp(url: URL): boolean {
  return `${url.protocol}//${url.host}` === appOrigin;
}

export function opensExternally(url: string): boolean {
  return URL.parse(url)?.protocol === 'https:';
}

export const minimumWindowSize = { width: 1280, height: 720 };

export interface Bounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function visibleBounds(
  saved: unknown,
  workAreas: readonly Bounds[],
): Bounds | undefined {
  if (!isBounds(saved)) {
    return undefined;
  }
  const minimum = 100;
  const onScreen = workAreas.some(
    (area) =>
      Math.min(saved.x + saved.width, area.x + area.width) -
        Math.max(saved.x, area.x) >=
        minimum &&
      Math.min(saved.y + saved.height, area.y + area.height) -
        Math.max(saved.y, area.y) >=
        minimum,
  );
  return onScreen
    ? { x: saved.x, y: saved.y, width: saved.width, height: saved.height }
    : undefined;
}

function isBounds(value: unknown): value is Bounds {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record: Record<string, unknown> = { ...value };
  return ['x', 'y', 'width', 'height'].every(
    (key) => typeof record[key] === 'number' && Number.isFinite(record[key]),
  );
}

export function firstWindowSize(workArea: Bounds): {
  readonly width: number;
  readonly height: number;
} {
  return {
    width: Math.min(1400, workArea.width),
    height: Math.min(900, workArea.height),
  };
}

export function minimumHeight(workAreas: readonly Bounds[]): number {
  return Math.min(
    minimumWindowSize.height,
    ...workAreas.map((area) => area.height),
  );
}

interface WindowState {
  isMinimized(): boolean;
  isMaximized(): boolean;
}

export function restoresMaximized(
  window: WindowState,
  initially: boolean,
): () => boolean {
  let maximized = initially;
  return () => {
    if (!window.isMinimized()) {
      maximized = window.isMaximized();
    }
    return maximized;
  };
}

interface NormalBounds {
  getNormalBounds(): Bounds;
}

export function keptBounds(
  window: NormalBounds,
  made: Bounds,
): { readonly changed: () => void; readonly bounds: () => Bounds } {
  let bounds = made;
  return {
    changed: () => {
      bounds = window.getNormalBounds();
    },
    bounds: () => bounds,
  };
}

export function rebuilt(file: string | null): 'page' | 'defaults' | undefined {
  if (file?.startsWith('webview.') || file === 'index.html') {
    return 'page';
  }
  return file === 'settings.json' ? 'defaults' : undefined;
}

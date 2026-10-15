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

export function startsAppPage(details: {
  readonly url: string;
  readonly isMainFrame: boolean;
  readonly isSameDocument: boolean;
}): boolean {
  return (
    details.isMainFrame && !details.isSameDocument && isAppUrl(details.url)
  );
}

function fromApp(url: URL): boolean {
  return `${url.protocol}//${url.host}` === appOrigin;
}

export function opensExternally(url: string): boolean {
  const protocol = URL.parse(url)?.protocol;
  return protocol === 'https:' || protocol === 'mailto:';
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
  const overlaps = workAreas.map((area) => {
    const across =
      Math.min(saved.x + saved.width, area.x + area.width) -
      Math.max(saved.x, area.x);
    const down =
      Math.min(saved.y + saved.height, area.y + area.height) -
      Math.max(saved.y, area.y);
    return { area, across, down };
  });
  const [mostly] = overlaps
    .filter(({ across, down }) => across >= minimum && down >= minimum)
    .toSorted((a, b) => b.across * b.down - a.across * a.down);
  if (mostly === undefined) {
    return undefined;
  }
  const bounds = {
    x: saved.x,
    y: saved.y,
    width: saved.width,
    height: saved.height,
  };
  const corners = [
    [bounds.x, bounds.y],
    [bounds.x + bounds.width, bounds.y],
    [bounds.x, bounds.y + bounds.height],
    [bounds.x + bounds.width, bounds.y + bounds.height],
  ] as const;
  const shown = corners.every(([x, y]) =>
    workAreas.some(
      (area) =>
        x >= area.x &&
        x <= area.x + area.width &&
        y >= area.y &&
        y <= area.y + area.height,
    ),
  );
  return shown ? bounds : fitted(bounds, mostly.area);
}

function fitted(bounds: Bounds, area: Bounds): Bounds {
  const width = Math.min(bounds.width, area.width);
  const height = Math.min(bounds.height, area.height);
  return {
    x: Math.min(Math.max(bounds.x, area.x), area.x + area.width - width),
    y: Math.min(Math.max(bounds.y, area.y), area.y + area.height - height),
    width,
    height,
  };
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

export function minimumWidth(workAreas: readonly Bounds[]): number {
  return Math.min(
    minimumWindowSize.width,
    ...workAreas.map((area) => area.width),
  );
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

interface ShownWindow {
  isDestroyed(): boolean;
  isMinimized(): boolean;
  restore(): void;
  focus(): void;
}

export function showAgain(window: ShownWindow): void {
  if (window.isDestroyed()) {
    return;
  }
  if (window.isMinimized()) {
    window.restore();
  }
  window.focus();
}

interface NormalBounds {
  getNormalBounds(): Bounds;
}

const scaledGrowth = 16;

export function keptBounds(
  window: NormalBounds,
  made: Bounds,
): {
  readonly moved: () => void;
  readonly resized: () => void;
  readonly bounds: () => Bounds;
} {
  let bounds = made;
  return {
    moved: () => {
      const moved = window.getNormalBounds();
      bounds =
        Math.abs(moved.width - bounds.width) <= scaledGrowth &&
        Math.abs(moved.height - bounds.height) <= scaledGrowth
          ? { ...bounds, x: moved.x, y: moved.y }
          : moved;
    },
    resized: () => {
      bounds = window.getNormalBounds();
    },
    bounds: () => bounds,
  };
}

export function rebuilt(file: string | null): 'page' | 'defaults' | undefined {
  if (
    file?.startsWith('webview.') ||
    file?.startsWith('syntaxWorker.') ||
    file === 'index.html'
  ) {
    return 'page';
  }
  return file === 'settings.json' ? 'defaults' : undefined;
}

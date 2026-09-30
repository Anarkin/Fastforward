import * as path from 'node:path';

export const appScheme = 'fastforward';
export const appOrigin = `${appScheme}://app`;

export function appFile(root: string, url: string): string | undefined {
  const parsed = new URL(url);
  if (`${parsed.protocol}//${parsed.host}` !== appOrigin) {
    return undefined;
  }
  const relative = decodeURIComponent(parsed.pathname).replace(/^\/+/, '');
  const file = path.resolve(root, relative || 'index.html');
  const inside = path.relative(root, file);
  return inside && !inside.startsWith('..') && !path.isAbsolute(inside)
    ? file
    : undefined;
}

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
  return onScreen ? saved : undefined;
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

import { isObject } from '../shell/main/settings';
import type { Bounds } from './files';

export const placesKey = 'windowPlaces';
export const boundsKey = 'windowBounds';
export const maximizedKey = 'windowMaximized';

export interface Place {
  readonly bounds: Bounds;
  readonly maximized: boolean;
}

export interface SavedPlace {
  readonly bounds: unknown;
  readonly maximized: boolean;
}

export function savedPlace(
  get: (key: string) => unknown,
  window: string,
  first: boolean,
): SavedPlace {
  const places = get(placesKey);
  if (isObject(places)) {
    const saved = places[window];
    return isObject(saved)
      ? { bounds: saved.bounds, maximized: saved.maximized === true }
      : { bounds: undefined, maximized: false };
  }
  return first
    ? { bounds: get(boundsKey), maximized: get(maximizedKey) === true }
    : { bounds: undefined, maximized: false };
}

export function withPlace(
  saved: unknown,
  window: string,
  place: Place,
  kept: readonly string[],
): Record<string, unknown> {
  const places = isObject(saved) ? saved : {};
  return Object.fromEntries(
    kept.flatMap((id) => {
      if (id === window) {
        return [[id, place]];
      }
      const other = places[id];
      return other === undefined ? [] : [[id, other]];
    }),
  );
}

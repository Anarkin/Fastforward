import {
  sameSearchOptions,
  type Search,
} from '../../../lib/shared/searchOptions';
import type { ScrollAnchor } from './diffScrollAnchor';

export interface DiffPlace {
  readonly top: number;
  readonly anchor: ScrollAnchor | undefined;
  readonly sideways: number;
  readonly left: number;
  readonly toggled: ReadonlyMap<string, boolean>;
  readonly current: number;
  readonly currentFor?: Search;
}

export const unplaced: DiffPlace = {
  top: 0,
  anchor: undefined,
  sideways: 0,
  left: 0,
  toggled: new Map(),
  current: 0,
};

export function diffPlaceKey(scope: string, selection: string): string {
  return JSON.stringify([scope, selection]);
}

export function currentOf(
  place: DiffPlace | undefined,
  search: Search,
): number {
  const found = place?.currentFor;
  return found !== undefined &&
    found.query === search.query &&
    sameSearchOptions(found.options, search.options)
    ? (place?.current ?? 0)
    : 0;
}

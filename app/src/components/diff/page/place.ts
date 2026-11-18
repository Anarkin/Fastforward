import {
  sameSearchOptions,
  searchSchema,
  type Search,
} from '../../../lib/shared/searchOptions';
import {
  count,
  flag,
  keyed,
  list,
  optional,
  record,
  text,
  type Schema,
} from '../../../lib/shared/schema';
import type { ScrollAnchor } from './scrollAnchor';

export interface DiffPlace {
  readonly top: number;
  readonly anchor: ScrollAnchor | undefined;
  readonly sideways: number;
  readonly toggled: ReadonlyMap<string, boolean>;
  readonly current: number;
  readonly currentFor?: Search;
}

export const unplaced: DiffPlace = {
  top: 0,
  anchor: undefined,
  sideways: 0,
  toggled: new Map(),
  current: 0,
};

export function diffPlaceKey(scope: string, selection: string): string {
  return JSON.stringify([scope, selection]);
}

export function diffPlaceScopeOf(key: string): string | undefined {
  const [scope]: unknown[] = JSON.parse(key);
  return typeof scope === 'string' ? scope : undefined;
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

const placeFields = record({
  top: count({ min: 0 }),
  anchor: optional(
    record({ shows: list(text(), { whole: true }), fraction: count() }),
  ),
  sideways: count({ min: 0 }),
  toggled: keyed(text(), flag(), { max: 1000 }),
  current: count({ min: 0, integer: true }),
  currentFor: optional(searchSchema),
});

export const diffPlaceSchema: Schema<DiffPlace> = {
  decode: (value) => {
    const place = placeFields.decode(value);
    return place && { ...place, anchor: place.anchor };
  },
  encode: ({ anchor, currentFor, ...place }) =>
    placeFields.encode({
      ...place,
      ...(anchor !== undefined && { anchor }),
      ...(currentFor !== undefined && { currentFor }),
    }),
};

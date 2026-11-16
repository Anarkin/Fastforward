import {
  isSearchOptions,
  type Search,
} from '../../../lib/shared/searchOptions';

export type Decode<T> = (value: unknown) => T | undefined;

export function isRecord(
  value: unknown,
): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export const aString: Decode<string> = (value) =>
  typeof value === 'string' ? value : undefined;

export const aNumber: Decode<number> = (value) =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

export const aBoolean: Decode<boolean> = (value) =>
  typeof value === 'boolean' ? value : undefined;

export const someStrings: Decode<readonly string[]> = (value) =>
  Array.isArray(value) && value.every((each) => typeof each === 'string')
    ? value
    : undefined;

export const aSearch: Decode<Search> = (value) => {
  if (!isRecord(value) || !isSearchOptions(value.options)) {
    return undefined;
  }
  const query = aString(value.query);
  return query === undefined ? undefined : { query, options: value.options };
};

export function entriesOf<T>(value: unknown, decode: Decode<T>): [string, T][] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry: unknown) => {
    if (!Array.isArray(entry) || entry.length !== 2) {
      return [];
    }
    const [key, each]: unknown[] = entry;
    const decoded = decode(each);
    return typeof key === 'string' && decoded !== undefined
      ? [[key, decoded] as [string, T]]
      : [];
  });
}

export function partsOf(value: string): unknown[] | undefined {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

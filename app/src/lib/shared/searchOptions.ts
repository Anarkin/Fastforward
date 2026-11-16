import { flag, record, text, type Schema } from './schema';

export interface SearchOptions {
  readonly caseSensitive: boolean;
  readonly wholeWord: boolean;
  readonly regex: boolean;
}

export const plainSearch: SearchOptions = {
  caseSensitive: false,
  wholeWord: false,
  regex: false,
};

const searchOptionNames = [
  'caseSensitive',
  'wholeWord',
  'regex',
] as const satisfies readonly (keyof SearchOptions)[];

export function isSearchOptions(value: unknown): value is SearchOptions {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const entries = Object.entries(value);
  return (
    entries.length === searchOptionNames.length &&
    entries.every(
      ([key, each]) =>
        searchOptionNames.some((name) => name === key) &&
        typeof each === 'boolean',
    )
  );
}

export function sameSearchOptions(
  one: SearchOptions,
  other: SearchOptions,
): boolean {
  return searchOptionNames.every((name) => one[name] === other[name]);
}

export interface Search {
  readonly query: string;
  readonly options: SearchOptions;
}

export const noSearch: Search = { query: '', options: plainSearch };

export const searchOptionsSchema: Schema<SearchOptions> = record({
  caseSensitive: flag(),
  wholeWord: flag(),
  regex: flag(),
});

export const searchSchema: Schema<Search> = record({
  query: text(),
  options: searchOptionsSchema,
});

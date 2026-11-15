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

export function sameSearchOptions(
  one: SearchOptions,
  other: SearchOptions,
): boolean {
  return searchOptionNames.every((name) => one[name] === other[name]);
}

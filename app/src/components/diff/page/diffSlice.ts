import {
  plainSearch,
  searchSchema,
  type Search,
} from '../../../lib/shared/searchOptions';
import { flag, optional, record, text } from '../../../lib/shared/schema';
import type { KeptPlaces } from '../../../lib/page/keptPlaces';
import { withEntry } from '../../../lib/page/tabKeyed';
import type { CodeSnap } from './codeSnap';
import {
  unmeasuredDiff,
  withSnap,
  withText,
  withWrapColumns,
  type DiffMeasures,
} from './diffMeasures';
import {
  diffPlaceKey,
  diffPlaceSchema,
  unplaced,
  type DiffPlace,
} from './diffPlace';
import type { WrapColumns } from './rowMeasures';
import type { TextMeasures } from './textLayout';

export interface KeptFind {
  readonly finding: boolean;
  readonly search: Search;
}

interface PickedLanguage {
  readonly key: string;
  readonly language: string;
}

export interface DiffSource {
  readonly diffMeasures: DiffMeasures;
  readonly diffFinds: ReadonlyMap<string, KeptFind>;
  readonly pickedLanguages: ReadonlyMap<string, PickedLanguage>;
}

export interface DiffActions {
  readonly measureDiffText: (measures: TextMeasures) => void;
  readonly snapDiffCode: (snap: (last: CodeSnap) => CodeSnap) => void;
  readonly keepWrapColumns: (columns: WrapColumns) => void;
  readonly keepDiffFind: (scope: string, find: KeptFind) => void;
  readonly closeDiffFind: (scope: string) => void;
  readonly diffPlaceOf: (
    scope: string,
    selection: string,
  ) => DiffPlace | undefined;
  readonly keepDiffPlace: (
    scope: string,
    selection: string,
    change: Partial<DiffPlace>,
  ) => void;
  readonly pickLanguage: (
    key: string | undefined,
    language: string | undefined,
  ) => void;
  readonly seeLanguageKey: (key: string | undefined) => void;
}

export const diffDefaults: DiffSource = {
  diffMeasures: unmeasuredDiff,
  diffFinds: new Map(),
  pickedLanguages: new Map(),
};

const closedFind: KeptFind = {
  finding: false,
  search: { query: '', options: plainSearch },
};

export const diffFindOf =
  (scope: string) =>
  ({ diffFinds }: DiffSource): KeptFind =>
    diffFinds.get(scope) ?? closedFind;

function languageScopeOf(key: string): string {
  const [scope]: unknown[] = JSON.parse(key);
  return typeof scope !== 'string' ? key : scope;
}

export const pickedFor =
  (key: string | undefined) =>
  ({ pickedLanguages }: DiffSource): string | undefined => {
    const picked =
      key === undefined ? undefined : pickedLanguages.get(languageScopeOf(key));
    return picked !== undefined && picked.key === key
      ? picked.language
      : undefined;
  };

export const diffViewFields = {
  find: optional(record({ finding: flag(), search: searchSchema })),
  place: optional(diffPlaceSchema),
  language: optional(text({ max: 256 })),
};

export function diffSlice<S extends DiffSource>(
  set: (change: (state: S) => Partial<DiffSource> | S) => void,
  get: () => S,
  places: KeptPlaces<DiffPlace>,
): DiffActions {
  return {
    measureDiffText: (measures) =>
      set((state) => ({
        diffMeasures: withText(state.diffMeasures, measures),
      })),
    snapDiffCode: (snap) =>
      set((state) => ({ diffMeasures: withSnap(state.diffMeasures, snap) })),
    keepWrapColumns: (columns) =>
      set((state) => ({
        diffMeasures: withWrapColumns(state.diffMeasures, columns),
      })),
    keepDiffFind: (scope, find) =>
      set((state) => ({ diffFinds: withEntry(state.diffFinds, scope, find) })),
    closeDiffFind: (scope) =>
      set((state) => ({
        diffFinds: withEntry(state.diffFinds, scope, {
          finding: false,
          search: {
            query: '',
            options: diffFindOf(scope)(state).search.options,
          },
        }),
      })),
    diffPlaceOf: (scope, selection) =>
      places.of(diffPlaceKey(scope, selection)),
    keepDiffPlace: (scope, selection, change) => {
      const key = diffPlaceKey(scope, selection);
      places.keep(key, {
        ...(places.of(key) ?? unplaced),
        ...change,
        ...(change.current !== undefined && {
          currentFor: diffFindOf(scope)(get()).search,
        }),
      });
    },
    seeLanguageKey: (key) =>
      set((state) => {
        const scope = key === undefined ? undefined : languageScopeOf(key);
        const picked =
          scope === undefined ? undefined : state.pickedLanguages.get(scope);
        return picked === undefined || picked.key === key
          ? state
          : {
              pickedLanguages: withEntry(
                state.pickedLanguages,
                scope,
                undefined,
              ),
            };
      }),
    pickLanguage: (key, language) =>
      set((state) => ({
        pickedLanguages: withEntry(
          state.pickedLanguages,
          key === undefined ? undefined : languageScopeOf(key),
          key === undefined || language === undefined
            ? undefined
            : { key, language },
        ),
      })),
  };
}

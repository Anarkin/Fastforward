import {
  plainSearch,
  searchSchema,
  type Search,
} from '../../../lib/shared/searchOptions';
import { flag, optional, record, text } from '../../../lib/shared/schema';
import { withRecent } from '../../../lib/page/recentPlaces';
import { withEntry } from '../../../lib/page/tabKeyed';
import type { CodeSnap } from './codeSnap';
import {
  unmeasuredDiff,
  withSnap,
  withText,
  withWrapColumns,
  type DiffMeasures,
} from './measures';
import {
  diffPlaceKey,
  diffPlaceSchema,
  unplaced,
  type DiffPlace,
} from './place';
import type { WrapColumns } from './rowMeasures';
import type { TextMeasures } from './textLayout';
import type { DiffLayout, DiffSettingMessage } from '../shared/protocol';

export interface KeptFind {
  readonly finding: boolean;
  readonly search: Search;
}

interface PickedLanguage {
  readonly key: string;
  readonly language: string;
}

export interface DiffSource {
  readonly showEntireFile: boolean;
  readonly ignoreWhitespace: boolean;
  readonly diffLayout: DiffLayout;
  readonly diffMeasures: DiffMeasures;
  readonly diffFinds: ReadonlyMap<string, KeptFind>;
  readonly pickedLanguages: ReadonlyMap<string, PickedLanguage>;
  readonly diffPlaces: ReadonlyMap<string, DiffPlace>;
}

export type PlaceChange =
  Partial<DiffPlace> | ((place: DiffPlace) => Partial<DiffPlace>);

export interface DiffActions {
  readonly changeShowEntireFile: (show: boolean) => void;
  readonly changeIgnoreWhitespace: (ignore: boolean) => void;
  readonly changeDiffLayout: (layout: DiffLayout) => void;
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
    change: PlaceChange,
  ) => void;
  readonly pickLanguage: (
    key: string | undefined,
    language: string | undefined,
  ) => void;
  readonly seeLanguageKey: (key: string | undefined) => void;
}

export const diffDefaults: DiffSource = {
  showEntireFile: false,
  ignoreWhitespace: false,
  diffLayout: 'sideBySide',
  diffMeasures: unmeasuredDiff,
  diffFinds: new Map(),
  pickedLanguages: new Map(),
  diffPlaces: new Map(),
};

const closedFind: KeptFind = {
  finding: false,
  search: { query: '', options: plainSearch },
};

export const diffFindOf =
  (scope: string) =>
  ({ diffFinds }: DiffSource): KeptFind =>
    diffFinds.get(scope) ?? closedFind;

const diffPlaceFor =
  (scope: string, selection: string) =>
  ({ diffPlaces }: DiffSource): DiffPlace | undefined =>
    diffPlaces.get(diffPlaceKey(scope, selection));

const drawnAlike = (one: DiffPlace, other: DiffPlace) =>
  one.toggled === other.toggled &&
  one.sideways === other.sideways &&
  one.current === other.current &&
  one.currentFor === other.currentFor;

export function drawnPlaceFor(
  scope: string,
  selection: string,
): (source: DiffSource) => DiffPlace | undefined {
  const placeOf = diffPlaceFor(scope, selection);
  let drawn: DiffPlace | undefined;
  return (source) => {
    const place = placeOf(source);
    if (
      drawn === undefined ||
      place === undefined ||
      !drawnAlike(drawn, place)
    ) {
      drawn = place;
    }
    return drawn;
  };
}

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
  post: (message: DiffSettingMessage) => void,
): DiffActions {
  return {
    changeShowEntireFile: (show) => {
      set(() => ({ showEntireFile: show }));
      post({ type: 'setShowEntireFile', show });
    },
    changeIgnoreWhitespace: (ignore) => {
      set(() => ({ ignoreWhitespace: ignore }));
      post({ type: 'setIgnoreWhitespace', ignore });
    },
    changeDiffLayout: (layout) => {
      set(() => ({ diffLayout: layout }));
      post({ type: 'setDiffLayout', layout });
    },
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
    diffPlaceOf: (scope, selection) => diffPlaceFor(scope, selection)(get()),
    keepDiffPlace: (scope, selection, change) =>
      set((state) => {
        const key = diffPlaceKey(scope, selection);
        const was = state.diffPlaces.get(key) ?? unplaced;
        const changed = typeof change === 'function' ? change(was) : change;
        return {
          diffPlaces: withRecent(state.diffPlaces, key, {
            ...was,
            ...changed,
            ...(changed.current !== undefined && {
              currentFor: diffFindOf(scope)(state).search,
            }),
          }),
        };
      }),
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

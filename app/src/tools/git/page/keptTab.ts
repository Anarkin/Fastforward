import { focusSchema, type KeptFocus } from '../../../lib/page/keptFocus';
import type { Search } from '../../../lib/shared/searchOptions';
import { columnOrder, type ColumnName } from './activeColumn';
import { diffPlaceKey, type DiffPlace } from './diffPlace';
import type { ScrollAnchor } from './diffScrollAnchor';
import type { MovedCursor } from './filesCursor';
import type { GitSource, KeptFind, KeptLocations, KeptPin } from './gitState';
import { tabScopeOf } from './gitSelectors';
import type { KeptPlaces } from './keptPlaces';
import type { Highlighted } from './locationHighlight';
import { withEntry, withKey } from './tabKeyed';
import type { FilterFolds, ViewFolders } from './viewFolders';
import { mostWorktrees } from './tabWorktrees';
import {
  aBoolean,
  aNumber,
  aSearch,
  aString,
  entriesOf,
  isRecord,
  partsOf,
  someStrings,
  type Decode,
} from './keptDecoding';

const mostPlaces = 20;

const mostNamed = 1000;

const lastNamed = (names: Iterable<string>): string[] =>
  [...names].slice(-mostNamed);

export interface TabPlaces {
  readonly diffPlaces: KeptPlaces<DiffPlace>;
  readonly focuses: KeptPlaces<KeptFocus>;
  readonly filesScrolls: KeptPlaces<number>;
  readonly locationScrolls: KeptPlaces<number>;
}

interface Picked {
  readonly key: string;
  readonly language: string;
}

interface KeptPlace {
  readonly top: number;
  readonly anchor?: ScrollAnchor;
  readonly sideways: number;
  readonly left: number;
  readonly toggled: readonly (readonly [string, boolean])[];
  readonly current: number;
  readonly currentFor?: Search;
}

interface KeptScope {
  readonly find?: KeptFind;
  readonly focus?: KeptFocus;
  readonly places?: readonly (readonly [string, KeptPlace])[];
  readonly language?: Picked;
}

interface KeptWorktree extends KeptScope {
  readonly commitsHidden?: true;
  readonly searching?: true;
  readonly column?: ColumnName;
  readonly filter?: Search;
  readonly search?: Search;
  readonly folders?: {
    readonly view?: string;
    readonly open: readonly string[];
    readonly closed: readonly string[];
  };
  readonly folds?: {
    readonly view: string;
    readonly searched: string;
    readonly closed: readonly string[];
  };
  readonly cursor?: MovedCursor;
  readonly pin?: KeptPin;
  readonly locations?: {
    readonly highlight?: Highlighted;
    readonly toggled: readonly string[];
  };
  readonly locationsScroll?: number;
  readonly filesScrolls?: readonly (readonly [string, number])[];
}

type KeptTarget =
  | { readonly kind: 'worktree'; readonly root: string }
  | { readonly kind: 'compare'; readonly tab: string };

export function worktreeScope(root: string): string {
  return tabScopeOf(undefined, root);
}

function compareScope(tab: string): string {
  return tabScopeOf(tab, undefined);
}

export function targetOf(scope: string): KeptTarget | undefined {
  const [kind, id] = partsOf(scope) ?? [];
  if (typeof id !== 'string') {
    return undefined;
  }
  if (kind === 'worktree') {
    return { kind, root: id };
  }
  return kind === 'compare' ? { kind, tab: id } : undefined;
}

function rootOfView(view: string): string | undefined {
  const [root] = partsOf(view) ?? [];
  return typeof root === 'string' ? root : undefined;
}

function selectionIn(scope: string, key: string): string | undefined {
  const [placed, selection] = partsOf(key) ?? [];
  return placed === scope && typeof selection === 'string'
    ? selection
    : undefined;
}

function languageScopeOfKey(key: string): string {
  const [scope] = partsOf(key) ?? [];
  return scope === 'compare' || typeof scope !== 'string' ? key : scope;
}

function given<K extends string, T>(
  name: K,
  value: T | undefined,
): { [P in K]?: T } {
  const kept: { [P in K]?: T } = {};
  if (value !== undefined) {
    kept[name] = value;
  }
  return kept;
}

function keptPlace({
  top,
  anchor,
  sideways,
  left,
  toggled,
  current,
  currentFor,
}: DiffPlace): KeptPlace {
  return {
    top,
    ...given('anchor', anchor),
    sideways,
    left,
    toggled: [...toggled],
    current,
    ...given('currentFor', currentFor),
  };
}

function scopeKept(
  source: GitSource,
  places: TabPlaces,
  scope: string,
  languageScope: string,
): KeptScope {
  const placed = places.diffPlaces.entries().flatMap(([key, place]) => {
    const selection = selectionIn(scope, key);
    return selection === undefined
      ? []
      : [[selection, keptPlace(place)] as const];
  });
  return {
    ...given('find', source.diffFinds.get(scope)),
    ...given('focus', places.focuses.of(scope)),
    ...(placed.length > 0 && { places: placed.slice(-mostPlaces) }),
    ...given('language', source.pickedLanguages.get(languageScope)),
  };
}

function keptWorktreeOf(
  source: GitSource,
  places: TabPlaces,
  root: string,
): KeptWorktree {
  const folders = source.folders.get(root);
  const folds = source.fileFolds.get(root);
  const locations = source.locations.get(root);
  const filesScrolls = places.filesScrolls
    .entries()
    .filter(([view]) => rootOfView(view) === root);
  return {
    ...(source.commitsHidden.has(root) && { commitsHidden: true }),
    ...(source.searching.has(root) && { searching: true }),
    ...given('column', source.activeColumns.get(root)),
    ...given('filter', source.fileFilters.get(root)),
    ...given('search', source.searches.get(root)),
    ...given(
      'folders',
      folders !== undefined &&
        (folders.open.size > 0 || folders.closed.size > 0)
        ? {
            ...given('view', folders.view),
            open: lastNamed(folders.open),
            closed: lastNamed(folders.closed),
          }
        : undefined,
    ),
    ...given(
      'folds',
      folds && {
        view: folds.view,
        searched: folds.searched,
        closed: lastNamed(folds.closed),
      },
    ),
    ...given('cursor', source.fileCursors.get(root)),
    ...given('pin', source.pinnedMessages.get(root)),
    ...given(
      'locations',
      locations && {
        ...given('highlight', locations.highlight),
        toggled: lastNamed(locations.toggled),
      },
    ),
    ...given('locationsScroll', places.locationScrolls.of(root)),
    ...(filesScrolls.length > 0 && {
      filesScrolls: filesScrolls.slice(-mostPlaces),
    }),
    ...scopeKept(source, places, worktreeScope(root), root),
  };
}

function keptCompareOf(
  source: GitSource,
  places: TabPlaces,
  tab: string,
): KeptScope {
  const scope = compareScope(tab);
  return scopeKept(source, places, scope, scope);
}

export function tabViewOf(
  source: GitSource,
  places: TabPlaces,
  worktrees: readonly string[],
  compare: string | undefined,
): string {
  return JSON.stringify(
    compare === undefined
      ? {
          worktrees: worktrees.map((root) => [
            root,
            keptWorktreeOf(source, places, root),
          ]),
        }
      : { compare: keptCompareOf(source, places, compare) },
  );
}

export function placeScopeOf(key: string): string | undefined {
  const [scope] = partsOf(key) ?? [];
  return typeof scope === 'string' ? scope : undefined;
}

const aColumn: Decode<ColumnName> = (value) =>
  columnOrder.find((column) => column === value);

const aFind: Decode<KeptFind> = (value) => {
  if (!isRecord(value)) {
    return undefined;
  }
  const finding = aBoolean(value.finding);
  const search = aSearch(value.search);
  return finding === undefined || search === undefined
    ? undefined
    : { finding, search };
};

const aFocus: Decode<KeptFocus> = focusSchema.decode;

const anAnchor: Decode<ScrollAnchor> = (value) => {
  if (!isRecord(value)) {
    return undefined;
  }
  const shows = someStrings(value.shows);
  const fraction = aNumber(value.fraction);
  return shows === undefined || fraction === undefined
    ? undefined
    : { shows, fraction };
};

const aPlace: Decode<DiffPlace> = (value) => {
  if (!isRecord(value)) {
    return undefined;
  }
  const top = aNumber(value.top);
  const sideways = aNumber(value.sideways);
  const left = aNumber(value.left);
  const current = aNumber(value.current);
  const anchor = anAnchor(value.anchor);
  const currentFor = aSearch(value.currentFor);
  const toggled = entriesOf(value.toggled, aBoolean);
  if (
    top === undefined ||
    sideways === undefined ||
    left === undefined ||
    current === undefined ||
    (value.anchor !== undefined && anchor === undefined) ||
    (value.currentFor !== undefined && currentFor === undefined) ||
    !Array.isArray(value.toggled) ||
    toggled.length !== value.toggled.length
  ) {
    return undefined;
  }
  return {
    top,
    anchor,
    sideways,
    left,
    toggled: new Map(toggled),
    current,
    ...given('currentFor', currentFor),
  };
};

const aFolders: Decode<ViewFolders> = (value) => {
  if (!isRecord(value)) {
    return undefined;
  }
  const view = aString(value.view);
  const open = someStrings(value.open)?.slice(-mostNamed);
  const closed = someStrings(value.closed)?.slice(-mostNamed);
  return open === undefined ||
    closed === undefined ||
    (value.view !== undefined && view === undefined)
    ? undefined
    : { view, open: new Set(open), closed: new Set(closed) };
};

const aFolds: Decode<FilterFolds> = (value) => {
  if (!isRecord(value)) {
    return undefined;
  }
  const view = aString(value.view);
  const searched = aString(value.searched);
  const closed = someStrings(value.closed)?.slice(-mostNamed);
  return view === undefined || searched === undefined || closed === undefined
    ? undefined
    : { view, searched, closed: new Set(closed) };
};

const aCursor: Decode<MovedCursor> = (value) => {
  if (!isRecord(value)) {
    return undefined;
  }
  const key = aString(value.key);
  const from = aString(value.from);
  const view = aString(value.view);
  return key === undefined ||
    view === undefined ||
    (value.from !== undefined && from === undefined)
    ? undefined
    : { key, from, view };
};

const aPin: Decode<KeptPin> = (value) => {
  if (!isRecord(value)) {
    return undefined;
  }
  const hash = aString(value.hash);
  const byKey = aBoolean(value.byKey);
  return hash === undefined || byKey === undefined
    ? undefined
    : { hash, byKey };
};

const aHighlight: Decode<Highlighted> = (value) => {
  if (!isRecord(value)) {
    return undefined;
  }
  const query = aString(value.query);
  const key = aString(value.key);
  return query === undefined || key === undefined ? undefined : { query, key };
};

const someLocations: Decode<KeptLocations> = (value) => {
  if (!isRecord(value)) {
    return undefined;
  }
  const highlight = aHighlight(value.highlight);
  const toggled = someStrings(value.toggled)?.slice(-mostNamed);
  return toggled === undefined ||
    (value.highlight !== undefined && highlight === undefined)
    ? undefined
    : { highlight, toggled: new Set(toggled) };
};

const pickedIn =
  (scope: string): Decode<Picked> =>
  (value) => {
    if (!isRecord(value)) {
      return undefined;
    }
    const key = aString(value.key);
    const language = aString(value.language);
    return key === undefined ||
      language === undefined ||
      languageScopeOfKey(key) !== scope
      ? undefined
      : { key, language };
  };

function restoreScope(
  source: GitSource,
  places: TabPlaces,
  scope: string,
  languageScope: string,
  kept: Readonly<Record<string, unknown>>,
): Pick<GitSource, 'diffFinds' | 'pickedLanguages'> {
  for (const [key] of places.diffPlaces.entries()) {
    if (selectionIn(scope, key) !== undefined) {
      places.diffPlaces.forget(key);
    }
  }
  for (const [selection, place] of entriesOf(kept.places, aPlace).slice(
    -mostPlaces,
  )) {
    places.diffPlaces.keep(diffPlaceKey(scope, selection), place);
  }
  const focus = aFocus(kept.focus);
  if (focus === undefined) {
    places.focuses.forget(scope);
  } else {
    places.focuses.keep(scope, focus);
  }
  return {
    diffFinds: withEntry(source.diffFinds, scope, aFind(kept.find)),
    pickedLanguages: withEntry(
      source.pickedLanguages,
      languageScope,
      pickedIn(languageScope)(kept.language),
    ),
  };
}

export function parsedKept(kept: string): unknown {
  try {
    return JSON.parse(kept);
  } catch {
    return undefined;
  }
}

export function handedWorktrees(kept: unknown): [string, unknown][] {
  return isRecord(kept)
    ? entriesOf(kept.worktrees, (worktree: unknown) => worktree).slice(
        -mostWorktrees,
      )
    : [];
}

export function handedCompare(kept: unknown): unknown {
  return isRecord(kept) ? kept.compare : undefined;
}

export function restoredWorktree(
  source: GitSource,
  places: TabPlaces,
  root: string,
  kept: unknown,
): Partial<GitSource> | undefined {
  if (!isRecord(kept)) {
    return undefined;
  }
  const scrolled = aNumber(kept.locationsScroll);
  if (scrolled === undefined) {
    places.locationScrolls.forget(root);
  } else {
    places.locationScrolls.keep(root, scrolled);
  }
  for (const [view] of places.filesScrolls.entries()) {
    if (rootOfView(view) === root) {
      places.filesScrolls.forget(view);
    }
  }
  for (const [view, offset] of entriesOf(kept.filesScrolls, aNumber).slice(
    -mostPlaces,
  )) {
    if (rootOfView(view) === root) {
      places.filesScrolls.keep(view, offset);
    }
  }
  return {
    commitsHidden: withKey(
      source.commitsHidden,
      root,
      kept.commitsHidden === true,
    ),
    searching: withKey(source.searching, root, kept.searching === true),
    activeColumns: withEntry(source.activeColumns, root, aColumn(kept.column)),
    fileFilters: withEntry(source.fileFilters, root, aSearch(kept.filter)),
    searches: withEntry(source.searches, root, aSearch(kept.search)),
    folders: withEntry(source.folders, root, aFolders(kept.folders)),
    fileFolds: withEntry(source.fileFolds, root, aFolds(kept.folds)),
    fileCursors: withEntry(source.fileCursors, root, aCursor(kept.cursor)),
    pinnedMessages: withEntry(source.pinnedMessages, root, aPin(kept.pin)),
    locations: withEntry(source.locations, root, someLocations(kept.locations)),
    foundCommits: withEntry(source.foundCommits, root, undefined),
    ...restoreScope(source, places, worktreeScope(root), root, kept),
  };
}

export function restoredCompare(
  source: GitSource,
  places: TabPlaces,
  tab: string,
  kept: unknown,
): Partial<GitSource> | undefined {
  if (!isRecord(kept)) {
    return undefined;
  }
  const scope = compareScope(tab);
  return restoreScope(source, places, scope, scope, kept);
}

function changedKeys(
  next: ReadonlyMap<string, unknown>,
  prev: ReadonlyMap<string, unknown>,
): string[] {
  return next === prev
    ? []
    : [...new Set([...next.keys(), ...prev.keys()])].filter(
        (key) => next.get(key) !== prev.get(key),
      );
}

function changedMembers(
  next: ReadonlySet<string>,
  prev: ReadonlySet<string>,
): string[] {
  return next === prev
    ? []
    : [...new Set([...next, ...prev])].filter(
        (key) => next.has(key) !== prev.has(key),
      );
}

const keptByRoot = [
  'activeColumns',
  'fileFilters',
  'searches',
  'folders',
  'fileFolds',
  'fileCursors',
  'pinnedMessages',
  'locations',
] as const satisfies readonly (keyof GitSource)[];

export function changedScopes(next: GitSource, prev: GitSource): string[] {
  return [
    ...new Set([
      ...changedMembers(next.commitsHidden, prev.commitsHidden).map(
        worktreeScope,
      ),
      ...changedMembers(next.searching, prev.searching).map(worktreeScope),
      ...keptByRoot.flatMap((name) =>
        changedKeys(next[name], prev[name]).map(worktreeScope),
      ),
      ...changedKeys(next.diffFinds, prev.diffFinds),
      ...changedKeys(next.pickedLanguages, prev.pickedLanguages).map((key) =>
        targetOf(key)?.kind === 'compare' ? key : worktreeScope(key),
      ),
    ]),
  ];
}

export function viewScope(view: string): string | undefined {
  const root = rootOfView(view);
  return root === undefined ? undefined : worktreeScope(root);
}

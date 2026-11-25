import {
  diffPlaceKey,
  diffPlaceScopeOf,
} from '../../../components/diff/page/place';
import type { GitSource } from './state';
import { tabScopeOf } from './selectors';
import { withoutWhere, withRecent } from '../../../lib/page/recentPlaces';
import { withEntry, withKey } from '../../../lib/page/tabKeyed';
import { maxViewChars } from '../../../shell/shared/protocol';
import {
  gitViewSchema,
  mostNamed,
  mostPlaces,
  worktreeViewSchema,
  type WorktreeView,
} from './tabView';

const lastNamed = (names: Iterable<string>): string[] =>
  [...names].slice(-mostNamed);

interface KeptTarget {
  readonly kind: 'worktree';
  readonly root: string;
}

function partsOf(value: string): unknown[] | undefined {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function worktreeScope(root: string): string {
  return tabScopeOf(root);
}

export function targetOf(scope: string): KeptTarget | undefined {
  const [kind, id] = partsOf(scope) ?? [];
  if (typeof id !== 'string') {
    return undefined;
  }
  return kind === 'worktree' ? { kind, root: id } : undefined;
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
  return typeof scope !== 'string' ? key : scope;
}

function lastOf<T>(
  entries: readonly (readonly [string, T])[],
): ReadonlyMap<string, T> | undefined {
  return entries.length > 0 ? new Map(entries.slice(-mostPlaces)) : undefined;
}

function worktreeViewOf(source: GitSource, root: string): WorktreeView {
  const scope = worktreeScope(root);
  const folders = source.folders.get(root);
  const folds = source.fileFolds.get(root);
  const locations = source.locations.get(root);
  return {
    commitsHidden: source.commitsHidden.has(root) ? true : undefined,
    searching: source.searching.has(root) ? true : undefined,
    column: source.activeColumns.get(root),
    filter: source.fileFilters.get(root),
    commitFilter: source.commitFilters.get(root),
    search: source.searches.get(root),
    folders:
      folders !== undefined &&
      (folders.open.size > 0 || folders.closed.size > 0)
        ? {
            view: folders.view,
            open: lastNamed(folders.open),
            closed: lastNamed(folders.closed),
          }
        : undefined,
    folds: folds && {
      view: folds.view,
      searched: folds.searched,
      closed: lastNamed(folds.closed),
    },
    cursor: source.fileCursors.get(root),
    pin: source.pinnedMessages.get(root),
    locations: locations && {
      highlight: locations.highlight,
      toggled: lastNamed(locations.toggled),
    },
    locationsScroll: source.locationScrolls.get(root),
    filesScrolls: lastOf(
      [...source.filesScrolls].filter(([view]) => rootOfView(view) === root),
    ),
    find: source.diffFinds.get(scope),
    focus: source.focuses.get(scope),
    places: lastOf(
      [...source.diffPlaces].flatMap(([key, place]) => {
        const selection = selectionIn(scope, key);
        return selection === undefined ? [] : [[selection, place] as const];
      }),
    ),
    language: source.pickedLanguages.get(root),
  };
}

export function tabViewOf(
  source: GitSource,
  worktrees: readonly string[],
): string {
  const kept = worktrees.map((root) =>
    JSON.stringify([
      root,
      worktreeViewSchema.encode(worktreeViewOf(source, root)) ?? {},
    ]),
  );
  const fits = (from: number) =>
    kept.slice(from).reduce((chars, each) => chars + each.length + 1, 16) <=
    maxViewChars;
  let from = 0;
  while (from < kept.length && !fits(from)) {
    from += 1;
  }
  return `{"worktrees":[${kept.slice(from).join(',')}]}`;
}

export function handedWorktrees(
  view: string,
): readonly (readonly [string, WorktreeView])[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(view);
  } catch {
    return [];
  }
  return [...(gitViewSchema.decode(parsed)?.worktrees ?? [])];
}

function restoreScope(
  source: GitSource,
  root: string,
  view: WorktreeView,
): Pick<GitSource, 'diffFinds' | 'pickedLanguages' | 'diffPlaces' | 'focuses'> {
  const scope = worktreeScope(root);
  let diffPlaces = withoutWhere(
    source.diffPlaces,
    (key) => selectionIn(scope, key) !== undefined,
  );
  for (const [selection, place] of view.places ?? []) {
    diffPlaces = withRecent(diffPlaces, diffPlaceKey(scope, selection), place);
  }
  const language =
    view.language !== undefined &&
    languageScopeOfKey(view.language.key) === root
      ? view.language
      : undefined;
  return {
    diffPlaces,
    focuses: withRecent(source.focuses, scope, view.focus),
    diffFinds: withEntry(source.diffFinds, scope, view.find),
    pickedLanguages: withEntry(source.pickedLanguages, root, language),
  };
}

export function restoredWorktree(
  source: GitSource,
  root: string,
  view: WorktreeView,
): Partial<GitSource> {
  let filesScrolls = withoutWhere(
    source.filesScrolls,
    (shown) => rootOfView(shown) === root,
  );
  for (const [shown, offset] of view.filesScrolls ?? []) {
    if (rootOfView(shown) === root) {
      filesScrolls = withRecent(filesScrolls, shown, offset);
    }
  }
  const { folders, folds, locations } = view;
  return {
    commitsHidden: withKey(
      source.commitsHidden,
      root,
      view.commitsHidden === true,
    ),
    searching: withKey(source.searching, root, view.searching === true),
    activeColumns: withEntry(source.activeColumns, root, view.column),
    fileFilters: withEntry(source.fileFilters, root, view.filter),
    commitFilters: withEntry(source.commitFilters, root, view.commitFilter),
    searches: withEntry(source.searches, root, view.search),
    folders: withEntry(
      source.folders,
      root,
      folders && {
        view: folders.view,
        open: new Set(folders.open),
        closed: new Set(folders.closed),
      },
    ),
    fileFolds: withEntry(
      source.fileFolds,
      root,
      folds && { ...folds, closed: new Set(folds.closed) },
    ),
    fileCursors: withEntry(
      source.fileCursors,
      root,
      view.cursor && { ...view.cursor, from: view.cursor.from },
    ),
    pinnedMessages: withEntry(source.pinnedMessages, root, view.pin),
    locations: withEntry(
      source.locations,
      root,
      locations && {
        highlight: locations.highlight,
        toggled: new Set(locations.toggled),
      },
    ),
    foundCommits: withEntry(source.foundCommits, root, undefined),
    locationScrolls: withRecent(
      source.locationScrolls,
      root,
      view.locationsScroll,
    ),
    filesScrolls,
    ...restoreScope(source, root, view),
  };
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
  'commitFilters',
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
      ...changedKeys(next.focuses, prev.focuses),
      ...changedKeys(next.diffPlaces, prev.diffPlaces).flatMap(
        (key) => diffPlaceScopeOf(key) ?? [],
      ),
      ...changedKeys(next.filesScrolls, prev.filesScrolls).flatMap(
        (view) => viewScope(view) ?? [],
      ),
      ...changedKeys(next.locationScrolls, prev.locationScrolls).map(
        worktreeScope,
      ),
      ...changedKeys(next.pickedLanguages, prev.pickedLanguages).map((key) =>
        worktreeScope(key),
      ),
    ]),
  ];
}

function viewScope(view: string): string | undefined {
  const root = rootOfView(view);
  return root === undefined ? undefined : worktreeScope(root);
}

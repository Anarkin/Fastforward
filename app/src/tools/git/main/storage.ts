import {
  workingTreeHash,
  type Bookmark,
  type ChangeArea,
  isBookmark,
} from '../shared/protocol';
import { sidesOf } from '../../../lib/shared/comparisons';
import { isFullHash } from '../../../lib/shared/hashes';
import type { GitSettings } from '../shared/settings';
import { isObject } from '../../../lib/main/json';
import type { UserSettings } from '../../../shell/main/userSettings';
import { maxRecentItems } from '../../../shell/main/storage';
import { sameRoot } from '../../../lib/main/paths';
import type { Store } from '../../../shell/main/stateFile';
import { LastFetches } from './lastFetches';
import { RemoteTagStore } from './remoteTagStore';
import { GitPreferences } from './preferences';
import { keyOf, recordOf, withoutRoots } from './rootRecords';

export const recentKey = 'recentRepositories';
export const soloKey = 'solo';
export const bookmarksKey = 'bookmarks';
export const worktreesKey = 'activeWorktrees';
export const cloneFolderKey = 'cloneFolder';
export const selectionsKey = 'selections';

export interface SavedSelection {
  readonly hash: string;
  readonly path?: string;
  readonly area?: ChangeArea;
}

export class GitStorage {
  readonly fetches: LastFetches;
  readonly remoteTags: RemoteTagStore;
  readonly preferences: GitPreferences;

  constructor(
    private readonly userSettings: UserSettings,
    private readonly state: Store,
  ) {
    this.fetches = new LastFetches(state);
    this.remoteTags = new RemoteTagStore(state);
    this.preferences = new GitPreferences(userSettings);
  }

  private get settings(): GitSettings {
    return this.userSettings.settings.tools.git;
  }

  worktreeOf(repository: string): string {
    const all = this.activeWorktrees;
    const saved = all[keyOf(all, repository)];
    return typeof saved === 'string' ? saved : repository;
  }

  async setWorktree(repository: string, worktree: string): Promise<void> {
    const all = { ...this.activeWorktrees };
    const key = keyOf(all, repository);
    if (sameRoot(worktree, repository)) {
      delete all[key];
    } else {
      all[key] = worktree;
    }
    await this.state.update(worktreesKey, all);
  }

  private get activeWorktrees(): Record<string, unknown> {
    return recordOf(this.state.get(worktreesKey));
  }

  selectionOf(worktree: string): SavedSelection | undefined {
    const all = this.selections;
    return selectionFrom(all[keyOf(all, worktree)]);
  }

  async setSelection(
    worktree: string,
    selection: SavedSelection | undefined,
  ): Promise<void> {
    const all = this.selections;
    const key = keyOf(all, worktree);
    const saved = selectionFrom(all[key]);
    const kept = selectionFrom(selection);
    if (
      saved?.hash === kept?.hash &&
      saved?.path === kept?.path &&
      saved?.area === kept?.area
    ) {
      return;
    }
    if (kept === undefined) {
      delete all[key];
    } else {
      all[key] = kept;
    }
    await this.state.update(selectionsKey, all);
  }

  private get selections(): Record<string, unknown> {
    return recordOf(this.state.get(selectionsKey));
  }

  get recent(): string[] {
    return stringsIn(this.state.get(recentKey));
  }

  async addRecent(root: string): Promise<void> {
    const known = this.recent;
    if (known[0] === root) {
      return;
    }
    const recent = [root, ...known.filter((r) => !sameRoot(r, root))];
    await this.state.update(recentKey, recent.slice(0, maxRecentItems));
  }

  async removeRecent(root: string): Promise<void> {
    await this.state.update(
      recentKey,
      this.recent.filter((r) => !sameRoot(r, root)),
    );
  }

  get cloneFolder(): string | undefined {
    const saved = this.state.get(cloneFolderKey);
    return typeof saved === 'string' ? saved : undefined;
  }

  async setCloneFolder(folder: string): Promise<void> {
    await this.state.update(cloneFolderKey, folder);
  }

  bookmarksOf(root: string): readonly Bookmark[] | undefined {
    const all = this.allBookmarks;
    const saved = all[keyOf(all, root)];
    return Array.isArray(saved) ? saved.filter(isBookmark) : undefined;
  }

  async setBookmarks(
    root: string,
    bookmarks: readonly Bookmark[],
  ): Promise<void> {
    const all = this.allBookmarks;
    await this.state.update(bookmarksKey, {
      ...all,
      [keyOf(all, root)]: bookmarks,
    });
  }

  private get allBookmarks(): Record<string, unknown> {
    return recordOf(this.state.get(bookmarksKey));
  }

  async forget(
    repository: string,
    worktrees: readonly string[],
  ): Promise<void> {
    const worktreesToo = [
      repository,
      this.worktreeOf(repository),
      ...worktrees,
    ];
    await Promise.all([
      withoutRoots(this.state, bookmarksKey, [repository]),
      this.remoteTags.forget(repository),
      this.fetches.forget(repository),
      withoutRoots(this.state, worktreesKey, [repository]),
      withoutRoots(this.state, soloKey, worktreesToo),
      withoutRoots(this.state, selectionsKey, worktreesToo),
    ]);
  }

  get soloDefault(): boolean {
    return this.settings.solo;
  }

  soloOf(root: string): boolean {
    const all = this.soloByRoot;
    const solo = all[keyOf(all, root)];
    return typeof solo === 'boolean' ? solo : this.settings.solo;
  }

  async setSolo(root: string, solo: boolean): Promise<void> {
    const all = { ...this.soloByRoot };
    const key = keyOf(all, root);
    if (solo === this.settings.solo) {
      delete all[key];
    } else {
      all[key] = solo;
    }
    await this.state.update(soloKey, all);
  }

  private get soloByRoot(): Record<string, unknown> {
    return recordOf(this.state.get(soloKey));
  }
}

function stringsIn(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === 'string')
    : [];
}

function selectionFrom(value: unknown): SavedSelection | undefined {
  if (!isObject(value)) {
    return undefined;
  }
  const { hash, path, area } = value;
  if (
    typeof hash !== 'string' ||
    !sidesOf(hash).every(
      (side) => side === workingTreeHash || isFullHash(side),
    ) ||
    !(path === undefined || isSavedPath(path)) ||
    !(area === undefined || area === 'staged' || area === 'unstaged')
  ) {
    return undefined;
  }
  return {
    hash,
    ...(path !== undefined && { path }),
    ...(area !== undefined && { area }),
  };
}

function isSavedPath(value: unknown): value is string {
  return (
    typeof value === 'string' && !value.includes('\0') && !value.includes('\n')
  );
}

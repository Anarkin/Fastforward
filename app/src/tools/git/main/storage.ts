import type {
  Bookmark,
  DiffLayout,
  GitToWebviewOf,
  LastFetch,
  RefKind,
} from '../shared/protocol';
import { isFullHash } from '../shared/hashes';
import type { GitSettings } from '../shared/settings';
import { isObject, type UserSettings } from '../../../shell/main/settings';
import {
  maxRecentItems,
  sameRoot,
  type Store,
} from '../../../shell/main/storage';

export const recentKey = 'recentRepositories';
export const soloKey = 'solo';
export const bookmarksKey = 'bookmarks';
export const worktreesKey = 'activeWorktrees';
export const lastFetchesKey = 'lastFetches';
export const remoteTagsKey = 'remoteTags';
export const cloneFolderKey = 'cloneFolder';
const maxAutoFetchMinutes = Math.floor((2 ** 31 - 1) / 60_000);

export class GitStorage {
  constructor(
    private readonly userSettings: UserSettings,
    private readonly state: Store,
  ) {}

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

  get recent(): string[] {
    return stringsIn(this.state.get(recentKey));
  }

  async addRecent(root: string): Promise<void> {
    const recent = [root, ...this.recent.filter((r) => !sameRoot(r, root))];
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

  lastFetchOf(repository: string): LastFetch {
    const all = this.lastFetches;
    const { succeeded, failed } = recordOf(all[keyOf(all, repository)]);
    return {
      ...(typeof succeeded === 'number' && { succeeded }),
      ...(typeof failed === 'number' && { failed }),
    };
  }

  async recordFetch(
    repository: string,
    failed: boolean,
    at: number,
  ): Promise<void> {
    const all = this.lastFetches;
    await this.state.update(lastFetchesKey, {
      ...all,
      [keyOf(all, repository)]: {
        ...this.lastFetchOf(repository),
        [failed ? 'failed' : 'succeeded']: at,
      },
    });
  }

  private get lastFetches(): Record<string, unknown> {
    return recordOf(this.state.get(lastFetchesKey));
  }

  remoteTagsOf(repository: string): Map<string, Map<string, string>> {
    const all = this.allRemoteTags;
    return new Map(
      Object.entries(recordOf(all[keyOf(all, repository)])).flatMap(
        ([remote, tags]): [string, Map<string, string>][] =>
          isObject(tags)
            ? [
                [
                  remote,
                  new Map(
                    Object.entries(tags).filter(
                      (tag): tag is [string, string] =>
                        typeof tag[1] === 'string' && isFullHash(tag[1]),
                    ),
                  ),
                ],
              ]
            : [],
      ),
    );
  }

  async setRemoteTags(
    repository: string,
    remote: string,
    tags: ReadonlyMap<string, string>,
  ): Promise<void> {
    const all = this.allRemoteTags;
    const key = keyOf(all, repository);
    await this.state.update(remoteTagsKey, {
      ...all,
      [key]: { ...recordOf(all[key]), [remote]: Object.fromEntries(tags) },
    });
  }

  async keepRemoteTags(
    repository: string,
    remotes: readonly string[],
  ): Promise<void> {
    const all = this.allRemoteTags;
    const key = keyOf(all, repository);
    const kept = Object.entries(recordOf(all[key])).filter(([remote]) =>
      remotes.includes(remote),
    );
    if (kept.length === Object.keys(recordOf(all[key])).length) {
      return;
    }
    await this.state.update(remoteTagsKey, {
      ...all,
      [key]: Object.fromEntries(kept),
    });
  }

  private get allRemoteTags(): Record<string, unknown> {
    return recordOf(this.state.get(remoteTagsKey));
  }

  get layout(): GitToWebviewOf<'layout'> {
    const { settings } = this;
    return {
      type: 'layout',
      columnWidths: settings.columnWidths,
      defaultColumnWidths: this.userSettings.defaults.tools.git.columnWidths,
      collapseMerges: settings.collapseMerges,
      entireFilePinned: settings.entireFilePinned,
      ignoreWhitespace: settings.ignoreWhitespace,
      wordWrap: settings.wordWrap,
      showWhitespace: settings.showWhitespace,
      diffLayout: settings.diffLayout,
      showAllFiles: settings.showAllFiles,
      autoFetch: settings.autoFetch,
      autoFetchMinutes: this.fetchMinutes,
      hideDimmedButtons: settings.hideDimmedButtons,
    };
  }

  private get fetchMinutes(): number {
    return Math.min(
      Math.max(0, this.settings.autoFetchMinutes),
      maxAutoFetchMinutes,
    );
  }

  get autoFetchMinutes(): number {
    return this.settings.autoFetch ? this.fetchMinutes : 0;
  }

  async setAutoFetch(on: boolean): Promise<void> {
    await this.userSettings.setIn('git', 'autoFetch', on);
  }

  get collapseMerges(): boolean {
    return this.settings.collapseMerges;
  }

  async setCollapseMerges(collapse: boolean): Promise<void> {
    await this.userSettings.setIn('git', 'collapseMerges', collapse);
  }

  async setColumnWidths(widths: readonly number[]): Promise<void> {
    await this.userSettings.setIn('git', 'columnWidths', widths);
  }

  get entireFilePinned(): boolean {
    return this.settings.entireFilePinned;
  }

  async setEntireFilePinned(pinned: boolean): Promise<void> {
    await this.userSettings.setIn('git', 'entireFilePinned', pinned);
  }

  get ignoreWhitespace(): boolean {
    return this.settings.ignoreWhitespace;
  }

  async setIgnoreWhitespace(ignore: boolean): Promise<void> {
    await this.userSettings.setIn('git', 'ignoreWhitespace', ignore);
  }

  async setWordWrap(wrap: boolean): Promise<void> {
    await this.userSettings.setIn('git', 'wordWrap', wrap);
  }

  async setShowWhitespace(show: boolean): Promise<void> {
    await this.userSettings.setIn('git', 'showWhitespace', show);
  }

  async setDiffLayout(layout: DiffLayout): Promise<void> {
    await this.userSettings.setIn('git', 'diffLayout', layout);
  }

  async setShowAllFiles(show: boolean): Promise<void> {
    await this.userSettings.setIn('git', 'showAllFiles', show);
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

function keyOf(roots: Record<string, unknown>, root: string): string {
  return Object.keys(roots).find((key) => sameRoot(key, root)) ?? root;
}

function stringsIn(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === 'string')
    : [];
}

function recordOf(value: unknown): Record<string, unknown> {
  return isObject(value) ? { ...value } : {};
}

const bookmarkKinds: readonly (RefKind | 'commit')[] = [
  'branch',
  'remote',
  'tag',
  'remote-tag',
  'commit',
];

export function isBookmark(value: unknown): value is Bookmark {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    'name' in value &&
    bookmarkKinds.some((kind) => kind === value.kind) &&
    typeof value.name === 'string'
  );
}

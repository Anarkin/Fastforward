import * as fs from 'node:fs';
import type {
  Bookmark,
  ToWebviewOf,
  DiffLayout,
  RefKind,
} from './shared/protocol';
import {
  isMissing,
  isObject,
  writeAtomically,
  type Settings,
  type UserSettings,
} from './settings';
import * as path from 'node:path';

export const tabsKey = 'tabs';
export const activeTabKey = 'activeTab';
export const recentKey = 'recentRepositories';
const maxRecent = 20;
export const soloKey = 'solo';
export const bookmarksKey = 'bookmarks';
export const worktreesKey = 'activeWorktrees';

export interface Store {
  get(key: string): unknown;
  update(key: string, value: unknown): Promise<void>;
}

export class JsonFileStore implements Store {
  private readonly values: Record<string, unknown>;
  private readonly unreadable: boolean;
  private writing: Promise<void> = Promise.resolve();
  private waiting = false;

  constructor(private readonly file: string) {
    const values = readJson(file);
    this.values = values ?? {};
    this.unreadable = values === undefined;
  }

  get(key: string): unknown {
    return this.values[key];
  }

  update(key: string, value: unknown): Promise<void> {
    if (value === undefined) {
      delete this.values[key];
    } else {
      this.values[key] = value;
    }
    if (!this.waiting && !this.unreadable) {
      this.waiting = true;
      this.writing = this.writing
        .catch(() => undefined)
        .then(() => {
          this.waiting = false;
          return writeAtomically(
            this.file,
            JSON.stringify(this.values, undefined, 2),
          );
        });
    }
    return this.writing;
  }

  saved(): Promise<void> {
    return this.writing.catch(() => undefined);
  }
}

function readJson(file: string): Record<string, unknown> | undefined {
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (error) {
    return isMissing(error) ? {} : undefined;
  }
  try {
    const parsed: unknown = JSON.parse(text);
    if (isObject(parsed)) {
      return { ...parsed };
    }
  } catch {}
  fs.copyFileSync(file, `${file}.corrupt`);
  return {};
}

const maxAutoFetchMinutes = Math.floor((2 ** 31 - 1) / 60_000);

export class Storage {
  constructor(
    private readonly userSettings: UserSettings,
    private readonly state: Store,
  ) {}

  private get settings(): Settings {
    return this.userSettings.settings;
  }

  get tabs(): string[] {
    return uniqueRoots(strings(this.state.get(tabsKey)));
  }

  get activeTab(): string | undefined {
    const active = this.state.get(activeTabKey);
    return typeof active === 'string' ? active : undefined;
  }

  get activeWorktree(): string | undefined {
    const active = this.activeTab;
    return active === undefined ? undefined : this.worktreeOf(active);
  }

  // The repository is its main worktree, unless it is bare
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

  hasTab(root: string): boolean {
    return strings(this.state.get(tabsKey)).some((tab) => sameRoot(tab, root));
  }

  async setTabs(tabs: string[], active: string | undefined): Promise<void> {
    await Promise.all([
      this.state.update(tabsKey, uniqueRoots(tabs)),
      this.state.update(activeTabKey, active),
    ]);
  }

  get recent(): string[] {
    return strings(this.state.get(recentKey));
  }

  async addRecent(root: string): Promise<void> {
    const recent = [root, ...this.recent.filter((r) => !sameRoot(r, root))];
    await this.state.update(recentKey, recent.slice(0, maxRecent));
  }

  async removeRecent(root: string): Promise<void> {
    await this.state.update(
      recentKey,
      this.recent.filter((r) => !sameRoot(r, root)),
    );
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

  get layout(): ToWebviewOf<'layout'> {
    const { settings } = this;
    return {
      type: 'layout',
      columnWidths: settings.columnWidths,
      defaultColumnWidths: this.userSettings.defaults.columnWidths,
      collapseMerges: settings.collapseMerges,
      entireFilePinned: settings.entireFilePinned,
      ignoreWhitespace: settings.ignoreWhitespace,
      wordWrap: settings.wordWrap,
      diffLayout: settings.diffLayout,
      showAllFiles: settings.showAllFiles,
      autoFetch: settings.autoFetch,
      autoFetchMinutes: settings.autoFetchMinutes,
    };
  }

  get autoFetchMinutes(): number {
    const { autoFetch, autoFetchMinutes } = this.settings;
    return autoFetch
      ? Math.min(Math.max(0, autoFetchMinutes), maxAutoFetchMinutes)
      : 0;
  }

  async setAutoFetch(on: boolean): Promise<void> {
    await this.userSettings.set('autoFetch', on);
  }

  get collapseMerges(): boolean {
    return this.settings.collapseMerges;
  }

  async setCollapseMerges(collapse: boolean): Promise<void> {
    await this.userSettings.set('collapseMerges', collapse);
  }

  async setColumnWidths(widths: readonly number[]): Promise<void> {
    await this.userSettings.set('columnWidths', widths);
  }

  get entireFilePinned(): boolean {
    return this.settings.entireFilePinned;
  }

  async setEntireFilePinned(pinned: boolean): Promise<void> {
    await this.userSettings.set('entireFilePinned', pinned);
  }

  get ignoreWhitespace(): boolean {
    return this.settings.ignoreWhitespace;
  }

  async setIgnoreWhitespace(ignore: boolean): Promise<void> {
    await this.userSettings.set('ignoreWhitespace', ignore);
  }

  async setWordWrap(wrap: boolean): Promise<void> {
    await this.userSettings.set('wordWrap', wrap);
  }

  async setDiffLayout(layout: DiffLayout): Promise<void> {
    await this.userSettings.set('diffLayout', layout);
  }

  async setShowAllFiles(show: boolean): Promise<void> {
    await this.userSettings.set('showAllFiles', show);
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

export function sameRoot(a: string, b: string): boolean {
  return path.relative(a, b) === '';
}

function keyOf(roots: Record<string, unknown>, root: string): string {
  return Object.keys(roots).find((key) => sameRoot(key, root)) ?? root;
}

function uniqueRoots(roots: readonly string[]): string[] {
  return roots.filter(
    (root, index) =>
      roots.findIndex((other) => sameRoot(other, root)) === index,
  );
}

function strings(value: unknown): string[] {
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
  'commit',
];

function isBookmark(value: unknown): value is Bookmark {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    'name' in value &&
    bookmarkKinds.some((kind) => kind === value.kind) &&
    typeof value.name === 'string'
  );
}

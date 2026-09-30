import * as fs from 'node:fs';
import type { Bookmark, ToWebviewOf } from './shared/protocol';
import { writeAtomically, type Settings, type UserSettings } from './settings';
import * as path from 'node:path';

export const tabsKey = 'tabs';
export const activeTabKey = 'activeTab';
export const recentKey = 'recentRepositories';
const maxRecent = 20;
export const soloKey = 'solo';
export const bookmarksKey = 'bookmarks';

export interface Store {
  // oxlint-disable-next-line typescript/no-unnecessary-type-parameters
  get<T>(key: string): T | undefined;
  get<T>(key: string, defaultValue: T): T;
  update(key: string, value: unknown): Promise<void>;
}

export class JsonFileStore implements Store {
  private readonly values: Record<string, unknown>;
  private writing: Promise<void> = Promise.resolve();

  constructor(private readonly file: string) {
    this.values = readJson(file);
  }

  // oxlint-disable-next-line typescript/no-unnecessary-type-parameters
  get<T>(key: string): T | undefined;
  get<T>(key: string, defaultValue: T): T;
  get<T>(key: string, defaultValue?: T): T | undefined {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    return (key in this.values ? this.values[key] : defaultValue) as
      T | undefined;
  }

  update(key: string, value: unknown): Promise<void> {
    if (value === undefined) {
      delete this.values[key];
    } else {
      this.values[key] = value;
    }
    const json = JSON.stringify(this.values, undefined, 2);
    this.writing = this.writing
      .catch(() => undefined)
      .then(() => writeAtomically(this.file, json));
    return this.writing;
  }

  saved(): Promise<void> {
    return this.writing.catch(() => undefined);
  }
}

function readJson(file: string): Record<string, unknown> {
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(text);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      !Array.isArray(parsed)
    ) {
      return { ...parsed };
    }
  } catch {}
  fs.copyFileSync(file, `${file}.corrupt`);
  return {};
}

export class Storage {
  constructor(
    private readonly userSettings: UserSettings,
    private readonly state: Store,
  ) {}

  private get settings(): Settings {
    return this.userSettings.settings;
  }

  get tabs(): string[] {
    return uniqueRoots(this.state.get<string[]>(tabsKey, []));
  }

  get activeTab(): string | undefined {
    return this.state.get<string>(activeTabKey);
  }

  hasTab(root: string): boolean {
    return this.tabs.some((tab) => sameRoot(tab, root));
  }

  async setTabs(tabs: string[], active: string | undefined): Promise<void> {
    await this.state.update(tabsKey, uniqueRoots(tabs));
    await this.state.update(activeTabKey, active);
  }

  get recent(): string[] {
    return this.state.get<string[]>(recentKey, []);
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
    return all[keyOf(all, root)];
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

  private get allBookmarks(): Record<string, readonly Bookmark[]> {
    return this.state.get(bookmarksKey, {});
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
      showAllFiles: settings.showAllFiles,
    };
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

  async setShowAllFiles(show: boolean): Promise<void> {
    await this.userSettings.set('showAllFiles', show);
  }

  soloOf(root: string): boolean {
    const all = this.soloByRoot;
    return all[keyOf(all, root)] ?? this.settings.solo;
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

  private get soloByRoot(): Record<string, boolean> {
    return this.state.get(soloKey, {});
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

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  defaultLayout,
  type Bookmark,
  type ChangesView,
  type FilesMode,
  type ToWebviewOf,
} from './shared/protocol';

export const tabsKey = 'tabs';
export const activeTabKey = 'activeTab';
export const recentKey = 'recentRepositories';
const maxRecent = 20;
const columnWidthsKey = 'columnWidths';
export const collapseMergesKey = 'collapseMerges';
export const entireFilePinnedKey = 'entireFilePinned';
export const soloKey = 'soloRepositories';
const filesModeKey = 'filesMode';
const changesViewKey = 'changesView';
export const bookmarksKey = 'vips';

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
      .then(async () => {
        const temporary = `${this.file}.tmp`;
        await fs.promises.mkdir(path.dirname(this.file), { recursive: true });
        await fs.promises.writeFile(temporary, json);
        await fs.promises.rename(temporary, this.file);
      });
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
  constructor(private readonly store: Store) {}

  get tabs(): string[] {
    return uniqueRoots(this.store.get<string[]>(tabsKey, []));
  }

  get activeTab(): string | undefined {
    return this.store.get<string>(activeTabKey);
  }

  hasTab(root: string): boolean {
    return this.tabs.some((tab) => sameRoot(tab, root));
  }

  async setTabs(tabs: string[], active: string | undefined): Promise<void> {
    await this.store.update(tabsKey, uniqueRoots(tabs));
    await this.store.update(activeTabKey, active);
  }

  get recent(): string[] {
    return this.store.get<string[]>(recentKey, []);
  }

  async addRecent(root: string): Promise<void> {
    const recent = [root, ...this.recent.filter((r) => !sameRoot(r, root))];
    await this.store.update(recentKey, recent.slice(0, maxRecent));
  }

  async removeRecent(root: string): Promise<void> {
    await this.store.update(
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
    await this.store.update(bookmarksKey, {
      ...all,
      [keyOf(all, root)]: bookmarks,
    });
  }

  private get allBookmarks(): Record<string, readonly Bookmark[]> {
    return this.store.get(bookmarksKey, {});
  }

  get layout(): ToWebviewOf<'layout'> {
    return {
      type: 'layout',
      columnWidths: this.store.get<number[]>(columnWidthsKey),
      collapseMerges: this.collapseMerges,
      entireFilePinned: this.entireFilePinned,
      filesMode: this.store.get<FilesMode>(
        filesModeKey,
        defaultLayout.filesMode,
      ),
      changesView: this.store.get<ChangesView>(
        changesViewKey,
        defaultLayout.changesView,
      ),
    };
  }

  get collapseMerges(): boolean {
    return this.store.get(collapseMergesKey, defaultLayout.collapseMerges);
  }

  async setColumnWidths(widths: readonly number[]): Promise<void> {
    await this.store.update(columnWidthsKey, widths);
  }

  get entireFilePinned(): boolean {
    return this.store.get(entireFilePinnedKey, defaultLayout.entireFilePinned);
  }

  async setEntireFilePinned(pinned: boolean): Promise<void> {
    await this.store.update(entireFilePinnedKey, pinned);
  }

  async setCollapseMerges(collapse: boolean): Promise<void> {
    await this.store.update(collapseMergesKey, collapse);
  }

  soloOf(root: string): boolean {
    return this.soloRoots.some((solo) => sameRoot(solo, root));
  }

  async setSolo(root: string, solo: boolean): Promise<void> {
    const others = this.soloRoots.filter((other) => !sameRoot(other, root));
    await this.store.update(soloKey, solo ? [...others, root] : others);
  }

  private get soloRoots(): string[] {
    return this.store.get<string[]>(soloKey, []);
  }

  async setFilesMode(mode: FilesMode): Promise<void> {
    await this.store.update(filesModeKey, mode);
  }

  async setChangesView(view: ChangesView): Promise<void> {
    await this.store.update(changesViewKey, view);
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

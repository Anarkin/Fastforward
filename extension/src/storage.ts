import * as path from 'node:path';
import type * as vscode from 'vscode';
import type {
  Bookmark,
  ChangesView,
  FilesMode,
  ToWebview,
} from './shared/protocol';

// Repository roots of the open tabs, kept per workspace
export const tabsKey = 'tabs';
export const activeTabKey = 'activeTab';
// Repository roots opened in any workspace, most recent first, offered by +
const recentKey = 'recentRepositories';
const maxRecent = 20;
// Column widths, per user and synced across machines, as they are a personal
// preference rather than something about a workspace
const columnWidthsKey = 'columnWidths';
// Whether merge commits start collapsed, like Sublime Merge's setting; per
// user and synced
export const collapseMergesKey = 'collapseMerges';
// What the Files column lists, per user and synced
const filesModeKey = 'filesMode';
// Whether the Changes tab is a list or a tree, per user and synced
const changesViewKey = 'changesView';
// Bookmarked refs and commits by repository root, per user; not synced, as
// roots are paths on this machine; named vips, as bookmarks were called at
// first
export const bookmarksKey = 'vips';

// What the view saves: the tabs per workspace, and the rest per user
export class Storage {
  constructor(
    private readonly workspaceState: vscode.Memento,
    private readonly globalState: vscode.ExtensionContext['globalState'],
  ) {
    globalState.setKeysForSync([
      columnWidthsKey,
      collapseMergesKey,
      filesModeKey,
      changesViewKey,
    ]);
  }

  // Once each, as tabs saved before could have a folder twice
  get tabs(): string[] {
    return uniqueRoots(this.workspaceState.get<string[]>(tabsKey, []));
  }

  get activeTab(): string | undefined {
    return this.workspaceState.get<string>(activeTabKey);
  }

  hasTab(root: string): boolean {
    return this.tabs.some((tab) => sameRoot(tab, root));
  }

  async setTabs(tabs: string[], active: string | undefined): Promise<void> {
    await this.workspaceState.update(tabsKey, uniqueRoots(tabs));
    await this.workspaceState.update(activeTabKey, active);
  }

  get recent(): string[] {
    return this.globalState.get<string[]>(recentKey, []);
  }

  async addRecent(root: string): Promise<void> {
    const recent = [root, ...this.recent.filter((r) => !sameRoot(r, root))];
    await this.globalState.update(recentKey, recent.slice(0, maxRecent));
  }

  async removeRecent(root: string): Promise<void> {
    await this.globalState.update(
      recentKey,
      this.recent.filter((r) => !sameRoot(r, root)),
    );
  }

  // Undefined for a repository that never had bookmarks saved
  bookmarksOf(root: string): readonly Bookmark[] | undefined {
    return this.globalState.get<Record<string, Bookmark[]>>(bookmarksKey, {})[
      root
    ];
  }

  async setBookmarks(
    root: string,
    bookmarks: readonly Bookmark[],
  ): Promise<void> {
    const all = this.globalState.get<Record<string, readonly Bookmark[]>>(
      bookmarksKey,
      {},
    );
    await this.globalState.update(bookmarksKey, { ...all, [root]: bookmarks });
  }

  get layout(): Extract<ToWebview, { type: 'layout' }> {
    return {
      type: 'layout',
      columnWidths: this.globalState.get<number[]>(columnWidthsKey),
      collapseMerges: this.collapseMerges,
      filesMode: this.globalState.get<FilesMode>(filesModeKey, 'changes'),
      changesView: this.globalState.get<ChangesView>(changesViewKey, 'list'),
    };
  }

  get collapseMerges(): boolean {
    return this.globalState.get(collapseMergesKey, true);
  }

  async setColumnWidths(widths: readonly number[]): Promise<void> {
    await this.globalState.update(columnWidthsKey, widths);
  }

  async setCollapseMerges(collapse: boolean): Promise<void> {
    await this.globalState.update(collapseMergesKey, collapse);
  }

  async setFilesMode(mode: FilesMode): Promise<void> {
    await this.globalState.update(filesModeKey, mode);
  }

  async setChangesView(view: ChangesView): Promise<void> {
    await this.globalState.update(changesViewKey, view);
  }
}

// The same folder, also spelled differently, like VS Code's "c:" drive letter
// next to the "C:" of a picked folder on Windows
export function sameRoot(a: string, b: string): boolean {
  return path.relative(a, b) === '';
}

function uniqueRoots(roots: readonly string[]): string[] {
  return roots.filter(
    (root, index) =>
      roots.findIndex((other) => sameRoot(other, root)) === index,
  );
}

import * as path from 'node:path';
import type * as vscode from 'vscode';
import {
  defaultLayout,
  type Bookmark,
  type ChangesView,
  type FilesMode,
  type ToWebview,
} from './shared/protocol';

export const tabsKey = 'tabs';
export const activeTabKey = 'activeTab';
const recentKey = 'recentRepositories';
const maxRecent = 20;
const columnWidthsKey = 'columnWidths';
export const collapseMergesKey = 'collapseMerges';
export const soloKey = 'solo';
const filesModeKey = 'filesMode';
const changesViewKey = 'changesView';
export const bookmarksKey = 'vips';

export class Storage {
  constructor(
    private readonly workspaceState: vscode.Memento,
    private readonly globalState: vscode.ExtensionContext['globalState'],
  ) {
    globalState.setKeysForSync([
      columnWidthsKey,
      collapseMergesKey,
      soloKey,
      filesModeKey,
      changesViewKey,
    ]);
  }

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
      solo: this.solo,
      filesMode: this.globalState.get<FilesMode>(
        filesModeKey,
        defaultLayout.filesMode,
      ),
      changesView: this.globalState.get<ChangesView>(
        changesViewKey,
        defaultLayout.changesView,
      ),
    };
  }

  get collapseMerges(): boolean {
    return this.globalState.get(
      collapseMergesKey,
      defaultLayout.collapseMerges,
    );
  }

  async setColumnWidths(widths: readonly number[]): Promise<void> {
    await this.globalState.update(columnWidthsKey, widths);
  }

  async setCollapseMerges(collapse: boolean): Promise<void> {
    await this.globalState.update(collapseMergesKey, collapse);
  }

  get solo(): boolean {
    return this.globalState.get(soloKey, defaultLayout.solo);
  }

  async setSolo(solo: boolean): Promise<void> {
    await this.globalState.update(soloKey, solo);
  }

  async setFilesMode(mode: FilesMode): Promise<void> {
    await this.globalState.update(filesModeKey, mode);
  }

  async setChangesView(view: ChangesView): Promise<void> {
    await this.globalState.update(changesViewKey, view);
  }
}

export function sameRoot(a: string, b: string): boolean {
  return path.relative(a, b) === '';
}

function uniqueRoots(roots: readonly string[]): string[] {
  return roots.filter(
    (root, index) =>
      roots.findIndex((other) => sameRoot(other, root)) === index,
  );
}

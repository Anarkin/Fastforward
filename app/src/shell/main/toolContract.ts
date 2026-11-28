import type { ToWebview, ToWebviewOf } from '../shared/protocol';
import type { ToHostOf, ToolId } from '../shared/tools';
import type { Compared, FileVersion, SavedTab } from './savedTabs';

export interface Page {
  post(message: ToWebview): void;
  readonly disposed: boolean;
}

export type Tab = SavedTab;

interface TabSides {
  readonly left: string;
  readonly right: string;
}

export interface TabName {
  readonly name: string;
  readonly folder?: string;
  readonly sides?: TabSides;
  readonly unsaved?: true;
}

export type Notice = Omit<ToWebviewOf<'notice'>, 'type'>;

export interface ShownTab {
  readonly page: Page | undefined;
  readonly tab: Tab;
}

export interface ShellAccess {
  page(): Page | undefined;
  pages(): readonly Page[];
  current(page: Page): Page | undefined;
  tabs(): readonly Tab[];
  shows(tool: ToolId, file: string): boolean;
  tabsOf(page: Page): readonly Tab[];
  active(page: Page): Tab | undefined;
  holds(page: Page, tab: string): boolean;
  shown(): readonly ShownTab[];
  open(
    page: Page,
    tool: ToolId,
    roots: readonly (string | undefined)[],
    reuse: boolean,
  ): Promise<void>;
  openView(page: Page, file: string, version?: FileVersion): Promise<void>;
  openEdit(page: Page, file: string): Promise<void>;
  openCompare(page: Page, compare: Compared): Promise<void>;
  openFolders(
    page: Page,
    tool: ToolId,
    folders: readonly string[],
  ): Promise<void>;
  setRoot(tab: string, root: string): void;
  setVersion(tab: string, root: string, version: FileVersion | undefined): void;
  setCompare(tab: string, compare: Compared): void;
  visited(folder: string): void;
  recentFolders(): number;
  postTabs(page: Page): void;
  notice(page: Page | undefined, notice: Notice): void;
  track<T>(work: Promise<T>): Promise<T>;
  idle(): Promise<void>;
}

export interface Tool<K extends ToolId> {
  readonly viewVersion: number;
  attach(shell: ShellAccess): void;
  ready(page: Page): void;
  show(page: Page, tab: Tab): Promise<void>;
  shows(page: Page, tab: Tab): boolean;
  hide(page: Page): void;
  preload(page: Page, tab: Tab): Promise<void>;
  closed(page: Page, tab: Tab): void;
  receive(page: Page, message: ToHostOf<K>): Promise<void>;
  dropped?(page: Page, files: unknown, message: unknown): Promise<void>;
  refreshShown(page: Page): Promise<void>;
  names(tabs: readonly Tab[]): ReadonlyMap<string, TabName>;
  fits(folder: string): Promise<boolean>;
  folderOf(tab: Tab): string | undefined;
  visited(folder: string): void;
  open(page: Page, folders: readonly string[]): Promise<void>;
  newTab(page: Page): Promise<void>;
  reloadSettings(): void;
  quitNote?(): string | undefined;
  quitWaits?(): Promise<void>;
  unsaved?(tab: Tab): boolean;
  saveUnsaved?(page: Page, tab: Tab): Promise<boolean>;
  discardUnsaved?(): void;
  quit(): void;
}

export type Tools = { readonly [K in ToolId]: Tool<K> };

export const unattachedShell: ShellAccess = {
  page: () => undefined,
  pages: () => [],
  current: () => undefined,
  tabs: () => [],
  shows: () => false,
  tabsOf: () => [],
  active: () => undefined,
  holds: () => false,
  shown: () => [],
  open: () => Promise.resolve(),
  openView: () => Promise.resolve(),
  openEdit: () => Promise.resolve(),
  openCompare: () => Promise.resolve(),
  openFolders: () => Promise.resolve(),
  setRoot: () => undefined,
  setVersion: () => undefined,
  setCompare: () => undefined,
  visited: () => undefined,
  recentFolders: () => 0,
  postTabs: () => undefined,
  notice: () => undefined,
  track: (work) => work,
  idle: () => Promise.resolve(),
};

import type { Page } from '../../../shell/main/shell';
import {
  isSide,
  sides,
  type CommanderToWebview,
  type Entry,
  type FlatProgress,
  type Side,
} from '../shared/protocol';
import type { FlatTree } from './flatTree';
import type { Duplicates } from './duplicates';
import type { BlockCache } from './textRows';
import type { FolderSizes, FolderSize } from './folderSizes';

export interface Duplicating {
  readonly look: number;
  readonly duplicates: Duplicates;
  flushing: NodeJS.Timeout | undefined;
  flushed: number;
}

export interface Flat {
  readonly walk: number;
  readonly tree: FlatTree;
  stopWatching: () => void;
  told: FlatProgress | undefined;
  flushing: NodeJS.Timeout | undefined;
  flushed: number;
}

export interface Sizing {
  readonly sizes: FolderSizes;
  flushing: NodeJS.Timeout | undefined;
  flushed: number;
}

export interface Pane {
  folder: string;
  flat?: Flat;
  sizing?: Sizing;
  duplicates?: Duplicating;
  hidden?: readonly boolean[];
  entries: readonly Entry[] | undefined;
  asked: number;
  landed: number;
  history: readonly string[];
  at: number;
  denied?: string;
  elevated?: boolean;
  archive?: string;
  opening?: AbortController;
  reading?: Promise<void>;
  binOff?: boolean;
  repositories: ReadonlySet<string>;
  repositoriesAsked: number;
  looked?: {
    readonly folder: string;
    readonly folders: ReadonlyMap<string, number | undefined>;
  };
}

export function newPane(folder: string): Pane {
  return {
    folder,
    entries: undefined,
    asked: 0,
    landed: 0,
    history: [folder],
    at: 0,
    repositories: new Set(),
    repositoriesAsked: 0,
  };
}

export type Panes = Record<Side, Pane> & { active: Side };

export interface ShownPane {
  readonly tab: string;
  readonly side: Side;
  readonly pane: Pane;
}

interface Viewing {
  readonly tab: string;
  readonly file: string;
  size: number;
  readonly binary: boolean;
  readonly blocks: BlockCache;
  readonly stop: () => void;
}

interface Watched {
  readonly folder: string;
  readonly elevated: boolean;
  readonly stop: () => void;
}

interface Showing {
  readonly tab: string;
  readonly watching: Map<Side, Watched>;
  viewing?: Viewing;
  viewingsAsked: number;
  finding?: AbortController;
  findingRequest?: number;
}

export class Sides {
  readonly shown = new Map<Page, Showing>();
  readonly panes = new Map<string, Panes>();

  shownPane(page: Page, tab: unknown, side: unknown): ShownPane | undefined {
    const shown = this.shown.get(page)?.tab;
    if (shown === undefined || shown !== tab || !isSide(side)) {
      return undefined;
    }
    const pane = this.panes.get(shown)?.[side];
    return pane && { tab: shown, side, pane };
  }

  namingPane(
    page: Page,
    tab: unknown,
    side: unknown,
    folder: unknown,
  ): ShownPane | undefined {
    const shown = this.shownPane(page, tab, side);
    return shown?.pane.folder === folder ? shown : undefined;
  }

  diskPane(
    page: Page,
    tab: unknown,
    side: unknown,
    folder: unknown,
  ): ShownPane | undefined {
    const shown = this.namingPane(page, tab, side, folder);
    return shown?.pane.archive === undefined ? shown : undefined;
  }

  pageShowing(tab: string): Page | undefined {
    for (const [page, showing] of this.shown) {
      if (showing.tab === tab) {
        return page;
      }
    }
    return undefined;
  }

  allPanes(): Pane[] {
    return [...this.panes.values()].flatMap((panes) =>
      sides.map((side) => panes[side]),
    );
  }

  stopShowing(page: Page): void {
    const showing = this.shown.get(page);
    if (showing === undefined) {
      return;
    }
    this.shown.delete(page);
    for (const { stop } of showing.watching.values()) {
      stop();
    }
    showing.watching.clear();
    showing.viewing?.stop();
    showing.viewing = undefined;
    showing.finding?.abort();
    showing.finding = undefined;
  }
}

export function post(page: Page, message: CommanderToWebview): void {
  page.post({ type: 'tool', tool: 'commander', message });
}

export type Listing = 'visit' | 'show' | 'refresh' | { readonly at: number };

const entriesByName = new WeakMap<
  readonly Entry[],
  ReadonlyMap<string, Entry>
>();

export function sizedEntry(entry: Entry, size: FolderSize | undefined): Entry {
  return size === undefined
    ? entry
    : {
        ...entry,
        size: size.bytes,
        ...(size.counting && { counting: true }),
        ...(size.unread > 0 && { unreadFolders: size.unread }),
      };
}

export function entryNamed(
  entries: readonly Entry[] | undefined,
  name: unknown,
): Entry | undefined {
  if (entries === undefined || typeof name !== 'string') {
    return undefined;
  }
  let named = entriesByName.get(entries);
  if (named === undefined) {
    const built = new Map<string, Entry>();
    for (const entry of entries) {
      if (!built.has(entry.name)) {
        built.set(entry.name, entry);
      }
    }
    named = built;
    entriesByName.set(entries, named);
  }
  return named.get(name);
}

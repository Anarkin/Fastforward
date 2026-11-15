import type { Page } from '../../../shell/main/toolContract';
import type {
  CommanderToHost,
  Entry,
  FlatFolder,
  FlatProgress,
} from '../shared/protocol';
import type { Side } from '../shared/sides';
import type { WatchFolder } from './watch';
import type { WatchTree } from './watchTree';
import { FlatTree } from './flatTree';
import {
  type Flat,
  type Pane,
  type ShownPane,
  type Sides,
  type Listing,
} from './sides';
import { post } from './post';
import { flushThrottled } from './throttledFlush';

export interface SideFlatAccess {
  readonly watch: WatchFolder;
  readonly watchTree?: WatchTree;
}

export interface SideFlatHost {
  readonly listed: (
    folder: string,
  ) => Promise<{ readonly entries: readonly Entry[] }>;
  readonly postListing: (
    page: Page,
    tab: string,
    side: Side,
    pane: Pane,
    selected: string | undefined,
  ) => void;
  readonly list: (
    page: Page,
    tab: string,
    side: Side,
    folder: string,
    how: Listing,
  ) => Promise<void>;
  readonly endSizing: (pane: Pane) => void;
  readonly flatRead: (pane: Pane) => void;
}

const maxEntriesTold = 5000;

function sameProgress(
  one: FlatProgress | undefined,
  other: FlatProgress,
): boolean {
  return (
    one !== undefined &&
    one.reading === other.reading &&
    one.stopped === other.stopped &&
    one.folders === other.folders &&
    one.failed === other.failed
  );
}

function inParts(folders: readonly FlatFolder[]): FlatFolder[][] {
  const parts: FlatFolder[][] = [];
  let part: FlatFolder[] = [];
  let entries = 0;
  for (const folder of folders) {
    if (part.length > 0 && entries + folder.entries.length > maxEntriesTold) {
      parts.push(part);
      part = [];
      entries = 0;
    }
    part.push(folder);
    entries += folder.entries.length;
  }
  if (part.length > 0 || parts.length === 0) {
    parts.push(part);
  }
  return parts;
}

export class SideFlat {
  private walks = 0;

  constructor(
    private readonly access: SideFlatAccess,
    private readonly sides: Sides,
    private readonly host: SideFlatHost,
  ) {}

  async turnFlat(
    page: Page,
    { tab, side, flat }: Extract<CommanderToHost, { type: 'flat' }>,
  ): Promise<void> {
    const shown = this.sides.shownPane(page, tab, side);
    if (shown === undefined || typeof flat !== 'boolean') {
      return;
    }
    if (flat && shown.pane.flat === undefined) {
      this.startFlat(page, shown);
    } else if (!flat && shown.pane.flat !== undefined) {
      this.endFlat(shown.pane);
      await this.host.list(
        page,
        shown.tab,
        shown.side,
        shown.pane.folder,
        'show',
      );
    }
  }

  startFlat(page: Page, { tab, side, pane }: ShownPane): void {
    this.endFlat(pane);
    this.host.endSizing(pane);
    const watching = this.sides.shown.get(page)?.watching;
    watching?.get(side)?.stop();
    watching?.delete(side);
    pane.asked++;
    pane.repositoriesAsked++;
    pane.repositories = new Set();
    const { folder } = pane;
    const tree = new FlatTree(
      folder,
      async (each) => (await this.host.listed(each)).entries,
      () => this.flatChanged(tab, side, flat),
    );
    const flat: Flat = {
      walk: ++this.walks,
      tree,
      stopWatching: () => {},
      told: undefined,
      flushing: undefined,
      flushed: 0,
    };
    pane.flat = flat;
    flat.stopWatching =
      pane.archive === undefined
        ? (this.access.watchTree?.(folder, (changed) => {
            if (changed === undefined) {
              tree.changedAll();
            } else {
              tree.changed(changed);
            }
          }) ?? (() => {}))
        : this.access.watch(pane.archive, () => tree.changedAll());
    this.host.postListing(page, tab, side, pane, undefined);
    tree.start();
  }

  endFlat(pane: Pane): void {
    const { flat } = pane;
    if (flat !== undefined) {
      pane.flat = undefined;
      flat.tree.close();
      flat.stopWatching();
      clearTimeout(flat.flushing);
    }
  }

  stopFlat(pane: Pane): void {
    pane.flat?.tree.stop();
  }

  private flatChanged(tab: string, side: Side, flat: Flat): void {
    flushThrottled(flat, () => this.flushFlat(tab, side, flat));
  }

  flushFlat(tab: string, side: Side, flat: Flat): void {
    const pane = this.sides.panes.get(tab)?.[side];
    const shownIn = this.sides.pageShowing(tab);
    if (pane?.flat !== flat || shownIn === undefined) {
      return;
    }
    const progress = flat.tree.progress;
    const folders = flat.tree.take();
    if (folders.length === 0 && sameProgress(flat.told, progress)) {
      return;
    }
    flat.told = progress;
    flat.flushed = Date.now();
    for (const part of inParts(folders)) {
      post(shownIn, {
        type: 'flatFiles',
        tab,
        side,
        folder: pane.folder,
        walk: flat.walk,
        folders: part,
        progress,
      });
    }
    if (!progress.reading) {
      this.host.flatRead(pane);
    }
  }
}

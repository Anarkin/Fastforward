import * as path from 'node:path';
import type { Page } from '../../../shell/main/shell';
import type {
  CommanderToHost,
  Entry,
  FlatFolder,
  FlatProgress,
  Side,
} from '../shared/protocol';
import type { WatchFolder, WatchTree } from './watch';
import { FlatTree } from './flatTree';
import { Duplicates, type Compared, type ContentReader } from './duplicates';
import { hashingHere } from './contentHash';
import { FolderSizes, listingWalker, type SizeWalker } from './folderSizes';
import {
  type Duplicating,
  type Flat,
  type Sizing,
  type Pane,
  type ShownPane,
  type Sides,
  post,
  type Listing,
  sizedEntry,
  entryNamed,
} from './sides';

export interface SideScansAccess {
  readonly contentReader?: ContentReader;
  readonly sizeWalker?: SizeWalker;
  readonly streamed?: (file: string) => boolean | Promise<boolean>;
  readonly watch: WatchFolder;
  readonly watchTree?: WatchTree;
}

export interface SideScansHost {
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
}

const maxEntriesTold = 5000;

const flushEvery = 100;

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

export class SideScans {
  private walks = 0;
  private looks = 0;

  constructor(
    private readonly access: SideScansAccess,
    private readonly sides: Sides,
    private readonly host: SideScansHost,
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
    this.endSizing(pane);
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

  private flatChanged(tab: string, side: Side, flat: Flat): void {
    flat.flushing ??= setTimeout(
      () => {
        flat.flushing = undefined;
        this.flushFlat(tab, side, flat);
      },
      Math.max(0, flat.flushed + flushEvery - Date.now()),
    );
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
      this.feedDuplicates(pane);
    }
  }

  turnDuplicates(
    page: Page,
    { tab, side, duplicates }: Extract<CommanderToHost, { type: 'duplicates' }>,
  ): void {
    const shown = this.sides.shownPane(page, tab, side);
    if (
      shown === undefined ||
      typeof duplicates !== 'boolean' ||
      shown.pane.archive !== undefined ||
      duplicates === (shown.pane.duplicates !== undefined)
    ) {
      return;
    }
    if (duplicates) {
      this.startDuplicates(shown);
    } else {
      this.endDuplicates(shown.pane);
    }
    this.host.postListing(page, shown.tab, shown.side, shown.pane, undefined);
  }

  private startDuplicates({ tab, side, pane }: ShownPane): void {
    const duplicating: Duplicating = {
      look: ++this.looks,
      duplicates: new Duplicates(
        this.access.contentReader ?? hashingHere,
        () => this.duplicatesChanged(tab, side, duplicating),
        { skip: async (file) => (await this.access.streamed?.(file)) === true },
      ),
      flushing: undefined,
      flushed: 0,
    };
    pane.duplicates = duplicating;
    if (pane.flat === undefined || !pane.flat.tree.progress.reading) {
      this.feedDuplicates(pane);
    }
  }

  feedDuplicates(pane: Pane): void {
    const { duplicates, flat, folder } = pane;
    if (duplicates === undefined) {
      return;
    }
    const files: Iterable<readonly [string, Entry]> =
      flat === undefined
        ? (pane.entries ?? []).map((entry) => [entry.name, entry] as const)
        : flat.tree.filesRead;
    const compared: Compared[] = [];
    for (const [key, entry] of files) {
      if (
        !entry.folder &&
        !entry.link &&
        entry.online !== true &&
        entry.size !== undefined &&
        entry.size > 0
      ) {
        compared.push({
          key,
          file: path.join(folder, key),
          size: entry.size,
          modified: entry.modified,
        });
      }
    }
    duplicates.duplicates.look(compared);
  }

  endDuplicates(pane: Pane): void {
    const { duplicates } = pane;
    if (duplicates !== undefined) {
      pane.duplicates = undefined;
      duplicates.duplicates.close();
      clearTimeout(duplicates.flushing);
    }
  }

  private duplicatesChanged(
    tab: string,
    side: Side,
    duplicating: Duplicating,
  ): void {
    duplicating.flushing ??= setTimeout(
      () => {
        duplicating.flushing = undefined;
        this.flushDuplicates(tab, side, duplicating);
      },
      Math.max(0, duplicating.flushed + flushEvery - Date.now()),
    );
  }

  flushDuplicates(
    tab: string,
    side: Side,
    duplicating: Duplicating | undefined,
  ): void {
    const pane = this.sides.panes.get(tab)?.[side];
    const shownIn = this.sides.pageShowing(tab);
    if (
      duplicating === undefined ||
      pane?.duplicates !== duplicating ||
      shownIn === undefined
    ) {
      return;
    }
    duplicating.flushed = Date.now();
    post(shownIn, {
      type: 'duplicateGroups',
      tab,
      side,
      folder: pane.folder,
      look: duplicating.look,
      groups: duplicating.duplicates.groups,
      reading: duplicating.duplicates.reading,
    });
  }

  countSizes(
    page: Page,
    {
      tab,
      side,
      folder,
      names,
    }: Extract<CommanderToHost, { type: 'countSizes' }>,
  ): void {
    const shown = this.sides.diskPane(page, tab, side, folder);
    if (
      shown === undefined ||
      shown.pane.flat !== undefined ||
      !Array.isArray(names) ||
      names.length === 0 ||
      !names.every(
        (name: unknown) =>
          entryNamed(shown.pane.entries, name)?.folder === true,
      )
    ) {
      return;
    }
    shown.pane.sizing ??= this.newSizing(shown);
    shown.pane.sizing.sizes.count(names);
  }

  private newSizing({ tab, side, pane }: ShownPane): Sizing {
    const sizing: Sizing = {
      sizes: new FolderSizes(
        pane.folder,
        (pane.elevated !== true && this.access.sizeWalker) ||
          listingWalker(async (each) => (await this.host.listed(each)).entries),
        () => this.sizesChanged(tab, side, sizing),
      ),
      flushing: undefined,
      flushed: 0,
    };
    return sizing;
  }

  endSizing(pane: Pane): void {
    const { sizing } = pane;
    if (sizing !== undefined) {
      pane.sizing = undefined;
      sizing.sizes.close();
      clearTimeout(sizing.flushing);
    }
  }

  private sizesChanged(tab: string, side: Side, sizing: Sizing): void {
    sizing.flushing ??= setTimeout(
      () => {
        sizing.flushing = undefined;
        this.flushSizes(tab, side, sizing);
      },
      Math.max(0, sizing.flushed + flushEvery - Date.now()),
    );
  }

  private flushSizes(tab: string, side: Side, sizing: Sizing): void {
    const pane = this.sides.panes.get(tab)?.[side];
    const shownIn = this.sides.pageShowing(tab);
    if (pane?.sizing !== sizing || shownIn === undefined) {
      return;
    }
    sizing.flushed = Date.now();
    const entries = sizing.sizes.take().flatMap((name) => {
      const entry = entryNamed(pane.entries, name);
      return entry?.folder === true
        ? [sizedEntry(entry, sizing.sizes.of(name))]
        : [];
    });
    if (entries.length > 0) {
      post(shownIn, {
        type: 'folderSizes',
        tab,
        side,
        folder: pane.folder,
        entries,
      });
    }
  }
}

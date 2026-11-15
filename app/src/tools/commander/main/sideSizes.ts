import type { Page } from '../../../shell/main/toolContract';
import type { CommanderToHost, Entry } from '../shared/protocol';
import type { Side } from '../shared/sides';
import { FolderSizes, type FolderSize } from './folderSizes';
import { listingWalker, type SizeWalker } from './sizeWalk';
import { type Sizing, type Pane, type ShownPane, type Sides } from './sides';
import { entryNamed } from './listedEntries';
import { post } from './post';
import { flushThrottled } from './throttledFlush';

export interface SideSizesAccess {
  readonly sizeWalker?: SizeWalker;
}

export interface SideSizesHost {
  readonly listed: (
    folder: string,
  ) => Promise<{ readonly entries: readonly Entry[] }>;
}

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

export class SideSizes {
  constructor(
    private readonly access: SideSizesAccess,
    private readonly sides: Sides,
    private readonly host: SideSizesHost,
  ) {}

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

  stopSizing(pane: Pane): void {
    pane.sizing?.sizes.stop();
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
    flushThrottled(sizing, () => this.flushSizes(tab, side, sizing));
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

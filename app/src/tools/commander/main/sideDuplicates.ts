import * as path from 'node:path';
import type { Page } from '../../../shell/main/toolContract';
import type { CommanderToHost, Entry } from '../shared/protocol';
import type { Side } from '../shared/sides';
import { Duplicates, type Compared, type ContentReader } from './duplicates';
import { hashingHere } from './contentHash';
import {
  type Duplicating,
  type Pane,
  type ShownPane,
  type Sides,
} from './sides';
import { post } from './post';
import { flushThrottled } from './throttledFlush';

export interface SideDuplicatesAccess {
  readonly contentReader?: ContentReader;
  readonly streamed?: (file: string) => boolean | Promise<boolean>;
}

export interface SideDuplicatesHost {
  readonly postListing: (
    page: Page,
    tab: string,
    side: Side,
    pane: Pane,
    selected: string | undefined,
  ) => void;
}

export class SideDuplicates {
  private looks = 0;

  constructor(
    private readonly access: SideDuplicatesAccess,
    private readonly sides: Sides,
    private readonly host: SideDuplicatesHost,
  ) {}

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

  forgetDuplicates(pane: Pane): void {
    pane.duplicates?.duplicates.forget();
  }

  stopDuplicates(pane: Pane): void {
    pane.duplicates?.duplicates.stop();
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
    flushThrottled(duplicating, () =>
      this.flushDuplicates(tab, side, duplicating),
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
}

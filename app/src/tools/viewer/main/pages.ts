import type { Page } from '../../../shell/main/toolContract';
import type { BlockCache } from '../../../lib/main/fileBlocks';

interface Viewing {
  readonly tab: string;
  readonly file: string;
  size: number;
  readonly binary: boolean;
  readonly blocks: BlockCache;
  readonly stop: () => void;
  readonly refresh: () => void;
}

interface Showing {
  readonly tab: string;
  viewing?: Viewing;
  viewingsAsked: number;
  finding?: AbortController;
  findingRequest?: number;
}

export class ViewerPages {
  readonly shown = new Map<Page, Showing>();

  pageShowing(tab: string): Page | undefined {
    for (const [page, showing] of this.shown) {
      if (showing.tab === tab) {
        return page;
      }
    }
    return undefined;
  }

  stopShowing(page: Page): void {
    const showing = this.shown.get(page);
    if (showing === undefined) {
      return;
    }
    this.shown.delete(page);
    showing.viewing?.stop();
    showing.viewing = undefined;
    showing.finding?.abort();
    showing.finding = undefined;
  }
}

import {
  rankedFolders,
  visitsIn,
  withVisit,
  type FolderVisits,
} from './folderRanks';
import type { Log } from '../../../shell/main/log';
import { sameRoot } from '../../../lib/main/paths';
import type { Store } from '../../../shell/main/stateFile';
import type { Page } from '../../../shell/main/toolContract';
import type { TerminalToWebview } from '../shared/protocol';
import { strings } from '../../../lib/shared/strings';

export interface FolderAccess {
  readonly store: Store;
  readonly home: string;
  readonly isFolder: (folder: string) => Promise<boolean>;
  readonly now: () => number;
  readonly choose: () => Promise<readonly string[]>;
}

export interface RecentFoldersHost {
  readonly log: Log;
  pages(): readonly Page[];
  recentFolders(): number;
  open(page: Page, folders: readonly string[]): Promise<void>;
  post(page: Page, message: TerminalToWebview): void;
}

const foldersKey = 'folders';

export class RecentFolders {
  private readonly foldersAsked = new WeakMap<Page, number>();

  constructor(
    private readonly access: FolderAccess,
    private readonly host: RecentFoldersHost,
  ) {}

  visited(folder: string): void {
    this.saveFolders(withVisit(this.visits(), folder, this.access.now()));
  }

  async openListed(page: Page, folder: string): Promise<void> {
    if ((await this.listed()).includes(folder)) {
      await this.open(page, [folder]);
    }
  }

  open(page: Page, folders: readonly string[]): Promise<void> {
    for (const folder of folders) {
      this.visited(folder);
    }
    return this.host.open(page, folders);
  }

  async browse(page: Page): Promise<void> {
    const chosen = await this.access.choose();
    if (chosen.length > 0) {
      await this.open(page, chosen);
    }
  }

  forget(folder: unknown): void {
    if (typeof folder !== 'string') {
      return;
    }
    this.saveFolders(
      this.visits().filter((entry) => !sameRoot(entry.folder, folder)),
    );
  }

  private visits(): FolderVisits[] {
    return visitsIn(this.access.store.get(foldersKey));
  }

  private saveFolders(visits: readonly FolderVisits[]): void {
    void this.access.store
      .update(foldersKey, visits)
      .catch((error: unknown) => {
        this.host.log.error(strings.log.savingFailed);
        this.host.log.error(error);
      });
    this.post(this.host.pages());
  }

  private async listed(): Promise<string[]> {
    const { home, isFolder, now } = this.access;
    const count = this.host.recentFolders();
    const ranked = rankedFolders(this.visits(), now()).filter(
      (folder) => !sameRoot(folder, home),
    );
    const listed: string[] = [];
    let at = 0;
    while (listed.length < count && at < ranked.length) {
      const batch = ranked.slice(at, at + count - listed.length);
      at += batch.length;
      const folders = await Promise.all(batch.map(isFolder));
      listed.push(...batch.filter((_, index) => folders[index]));
    }
    return listed;
  }

  post(pages: readonly Page[]): void {
    const asked = pages.map((page) => {
      const count = (this.foldersAsked.get(page) ?? 0) + 1;
      this.foldersAsked.set(page, count);
      return [page, count] as const;
    });
    void this.listed().then((folders) => {
      for (const [page, count] of asked) {
        if (this.foldersAsked.get(page) === count) {
          this.host.post(page, { type: 'folders', folders });
        }
      }
    });
  }
}

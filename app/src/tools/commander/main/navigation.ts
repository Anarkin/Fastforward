import * as path from 'node:path';
import type { Page } from '../../../shell/main/toolContract';
import type { CommanderToHost } from '../shared/protocol';
import type { Side } from '../shared/sides';
import type { LocalFileSystem } from './fileSystem';
import type { Listing, Sides } from './sides';
import type { CommanderAccess } from './access';
import { isFile } from './fileStats';
import { shownBookmarks, type BookmarkSystem } from './bookmarks';
import { typedPath } from './typedPaths';

export type NavigationAccess = Pick<
  CommanderAccess,
  'settings' | 'platform' | 'home' | 'variable' | 'knownFolder'
>;

export interface NavigationHost {
  readonly list: (
    page: Page,
    tab: string,
    side: Side,
    folder: string,
    how: Listing,
    fallback?: string,
    selecting?: string,
  ) => Promise<void>;
  readonly files: () => Promise<LocalFileSystem>;
}

export class Navigation {
  constructor(
    private readonly access: NavigationAccess,
    private readonly sides: Sides,
    private readonly host: NavigationHost,
  ) {}

  private get bookmarkSystem(): BookmarkSystem {
    return { paths: path, platform: this.access.platform };
  }

  step(page: Page, tab: unknown, side: unknown, step: unknown): Promise<void> {
    const shown = this.sides.shownPane(page, tab, side);
    if (shown === undefined || (step !== -1 && step !== 1)) {
      return Promise.resolve();
    }
    const at = shown.pane.at + step;
    const folder = shown.pane.history.at(at);
    return at < 0 || folder === undefined
      ? Promise.resolve()
      : this.host.list(page, shown.tab, shown.side, folder, { at });
  }

  async goToBookmark(
    page: Page,
    { tab, side, folder }: Extract<CommanderToHost, { type: 'goToBookmark' }>,
  ): Promise<void> {
    const shown = this.sides.shownPane(page, tab, side);
    const bookmarked = shownBookmarks(
      this.access.settings().bookmarks,
      this.bookmarkSystem,
    ).find((bookmark) => bookmark === folder);
    if (shown !== undefined && bookmarked !== undefined) {
      await this.host.list(page, shown.tab, shown.side, bookmarked, 'visit');
    }
  }

  async goTo(
    page: Page,
    { tab, side, folder, to }: Extract<CommanderToHost, { type: 'goTo' }>,
  ): Promise<void> {
    const shown = this.sides.namingPane(page, tab, side, folder);
    const { home, variable, knownFolder } = this.access;
    const target =
      shown === undefined || typeof to !== 'string'
        ? undefined
        : await typedPath(to, shown.pane.folder, {
            ...this.bookmarkSystem,
            home,
            variable: variable ?? (() => undefined),
            knownFolder,
          });
    if (shown === undefined || target === undefined) {
      return;
    }
    if (await isFile(target)) {
      await this.host.list(
        page,
        shown.tab,
        shown.side,
        path.dirname(target),
        'visit',
        undefined,
        path.basename(target),
      );
      return;
    }
    await this.host.list(page, shown.tab, shown.side, target, 'visit');
  }

  async drive(
    page: Page,
    tab: unknown,
    side: unknown,
    drive: unknown,
  ): Promise<void> {
    const shown = this.sides.shownPane(page, tab, side);
    if (shown === undefined) {
      return;
    }
    const drives = await (await this.host.files()).drives();
    const chosen = drives.find((each) => each === drive);
    if (chosen !== undefined) {
      await this.host.list(page, shown.tab, shown.side, chosen, 'visit');
    }
  }
}

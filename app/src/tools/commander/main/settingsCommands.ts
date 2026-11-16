import * as path from 'node:path';
import type { Page } from '../../../shell/main/toolContract';
import { type CommanderToHost } from '../shared/protocol';
import { isSide } from '../shared/sides';
import { heldColumns, isColumnWidths } from '../shared/columnWidths';
import { isSort } from '../shared/sorts';
import {
  shownBookmarks,
  withBookmark,
  withoutBookmark,
  type BookmarkSystem,
} from './bookmarks';
import { heldBox } from '../shared/thumbnails';
import type { Sides } from './sides';
import { post } from './post';
import type { CommanderAccess } from './commanderAccess';

export type SettingsCommandsAccess = Pick<
  CommanderAccess,
  | 'settings'
  | 'saveColumns'
  | 'saveSorts'
  | 'saveShowHidden'
  | 'saveBookmarks'
  | 'defaultColumns'
  | 'elevate'
  | 'platform'
  | 'gitMissing'
>;

export class SettingsCommands {
  constructor(
    private readonly access: SettingsCommandsAccess,
    private readonly sides: Sides,
  ) {}

  async columns(
    page: Page,
    message: Extract<CommanderToHost, { type: 'columns' }>,
  ): Promise<void> {
    if (isColumnWidths(message.columns)) {
      const { extension, size, date } = message.columns;
      await this.access.saveColumns({ extension, size, date });
      this.post(page);
    }
  }

  async sort(
    page: Page,
    message: Extract<CommanderToHost, { type: 'sort' }>,
  ): Promise<void> {
    if (isSide(message.side) && isSort(message.sort)) {
      const { column, descending, groupByColor } = message.sort;
      await this.access.saveSorts({
        ...this.access.settings().sort,
        [message.side]: { column, descending, groupByColor },
      });
      this.post(page);
    }
  }

  async showHidden(
    page: Page,
    message: Extract<CommanderToHost, { type: 'showHidden' }>,
  ): Promise<void> {
    if (typeof message.shown === 'boolean') {
      await this.access.saveShowHidden(message.shown);
      this.post(page);
    }
  }

  addBookmark(
    page: Page,
    message: Extract<CommanderToHost, { type: 'addBookmark' }>,
  ): Promise<void> | undefined {
    const shown = this.sides.diskPane(
      page,
      message.tab,
      message.side,
      message.folder,
    );
    return shown === undefined
      ? undefined
      : this.saveBookmarks(page, (stored, system) =>
          withBookmark(stored, shown.pane.folder, system),
        );
  }

  removeBookmark(
    page: Page,
    message: Extract<CommanderToHost, { type: 'removeBookmark' }>,
  ): Promise<void> | undefined {
    const { folder } = message;
    return typeof folder === 'string'
      ? this.saveBookmarks(page, (stored, system) =>
          withoutBookmark(stored, folder, system),
        )
      : undefined;
  }

  post(page: Page): void {
    const { showHidden, sort, columns, thumbnailSize, fileColors, bookmarks } =
      this.access.settings();
    post(page, {
      type: 'settings',
      showHidden,
      sort,
      columns: heldColumns(columns),
      defaultColumns: this.access.defaultColumns(),
      canElevate: this.access.elevate !== undefined,
      platform: this.access.platform,
      thumbnailSize: heldBox(thumbnailSize),
      fileColors,
      bookmarks: shownBookmarks(bookmarks, this.bookmarkSystem),
      ...(this.access.gitMissing?.() === true && { gitMissing: true }),
    });
  }

  private get bookmarkSystem(): BookmarkSystem {
    return { paths: path, platform: this.access.platform };
  }

  private async saveBookmarks(
    page: Page,
    change: (
      stored: readonly string[],
      system: BookmarkSystem,
    ) => readonly string[],
  ): Promise<void> {
    const stored = this.access.settings().bookmarks;
    const changed = change(stored, this.bookmarkSystem);
    if (changed !== stored) {
      await this.access.saveBookmarks(changed);
      this.post(page);
    }
  }
}

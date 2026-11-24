import * as path from 'node:path';
import { strings } from '../../../lib/shared/strings';
import type { Page, ShellAccess } from '../../../shell/main/toolContract';
import type { CommanderToHost } from '../shared/protocol';
import type { Side } from '../shared/sides';
import { codeOf, reasonOf } from '../../../lib/main/reasons';
import { nameProblem } from '../shared/names';
import { type Sides, type Listing } from './sides';
import { listedIn } from './listedEntries';
import type { ArchiveCommands } from './archiveCommands';
import type { CommanderAccess } from './access';
import type { Transfers } from './transfers';
import { binTrims, trashJob } from './trashJob';

export type ItemChangesAccess = Pick<
  CommanderAccess,
  'trash' | 'makeFolder' | 'renameItem' | 'platform'
>;

export interface ItemChangesHost {
  readonly shell: () => ShellAccess;
  readonly list: (
    page: Page,
    tab: string,
    side: Side,
    folder: string,
    how: Listing,
    fallback?: string,
    selecting?: string,
  ) => Promise<void>;
}

export class ItemChanges {
  constructor(
    private readonly access: ItemChangesAccess,
    private readonly sides: Sides,
    private readonly archiveCommands: ArchiveCommands,
    private readonly transfers: Pick<Transfers, 'start'>,
    private readonly host: ItemChangesHost,
  ) {}

  async delete(
    page: Page,
    {
      tab,
      side,
      folder: named,
      names,
      permanently,
    }: Extract<CommanderToHost, { type: 'delete' }>,
  ): Promise<void> {
    const inArchive = this.sides.namingPane(page, tab, side, named);
    if (inArchive?.pane.archive !== undefined) {
      this.archiveCommands.deleteInArchive(page, inArchive, names);
      return;
    }
    const shown = this.sides.diskPane(page, tab, side, named);
    if (
      shown === undefined ||
      !Array.isArray(names) ||
      names.length === 0 ||
      !names.every(
        (name: unknown) => listedIn(shown.pane, name) !== undefined,
      ) ||
      typeof permanently !== 'boolean'
    ) {
      return;
    }
    if (shown.pane.elevated === true) {
      this.host.shell().notice(page, {
        level: 'error',
        message: strings.commander.deleteAsAdministrator,
      });
      return;
    }
    const { folder } = shown.pane;
    const sources = names.map((name: string) => path.join(folder, name));
    if (permanently) {
      this.transfers.start({
        plan: { sources, target: folder, move: true, deletes: true },
        folder,
        names,
        deleting: 'permanently',
      });
      return;
    }
    const trimmed = sources.find((source: string) =>
      binTrims(source, this.access.platform),
    );
    if (trimmed !== undefined) {
      this.host.shell().notice(page, {
        level: 'error',
        message: strings.commander.binTrims(trimmed),
      });
      return;
    }
    const { trash } = this.access;
    if (trash !== undefined) {
      this.transfers.start(
        {
          plan: { sources, target: folder, move: true },
          folder,
          names,
          deleting: 'trash',
        },
        trashJob(trash),
      );
    }
  }

  async newFolder(
    page: Page,
    {
      tab,
      side,
      folder,
      name,
    }: Extract<CommanderToHost, { type: 'newFolder' }>,
  ): Promise<void> {
    const inArchive = this.sides.namingPane(page, tab, side, folder);
    if (inArchive?.pane.archive !== undefined) {
      this.archiveCommands.folderInArchive(page, inArchive, name);
      return;
    }
    const shown = this.sides.diskPane(page, tab, side, folder);
    const { makeFolder } = this.access;
    if (
      shown === undefined ||
      makeFolder === undefined ||
      typeof name !== 'string' ||
      name !== path.basename(name) ||
      nameProblem(name, this.access.platform) !== undefined
    ) {
      return;
    }
    if (shown.pane.elevated === true) {
      this.host.shell().notice(page, {
        level: 'error',
        message: strings.commander.makeFolderAsAdministrator,
      });
      return;
    }
    const made = shown.pane.folder;
    try {
      await makeFolder(path.join(made, name));
    } catch (error) {
      this.host.shell().notice(page, {
        level: 'error',
        message:
          codeOf(error) === 'EEXIST'
            ? strings.commander.nameTaken(path.join(made, name))
            : strings.commander.makeFolderFailed(
                path.join(made, name),
                reasonOf(error),
              ),
      });
      return;
    }
    if (shown.pane.folder === made) {
      await this.host.list(
        page,
        shown.tab,
        shown.side,
        made,
        'show',
        undefined,
        name,
      );
    }
  }

  async rename(
    page: Page,
    {
      tab,
      side,
      folder,
      name,
      to,
    }: Extract<CommanderToHost, { type: 'rename' }>,
  ): Promise<void> {
    const inArchive = this.sides.namingPane(page, tab, side, folder);
    if (inArchive?.pane.archive !== undefined) {
      this.archiveCommands.renameInArchive(page, inArchive, name, to);
      return;
    }
    const shown = this.sides.diskPane(page, tab, side, folder);
    const { renameItem } = this.access;
    if (
      shown === undefined ||
      renameItem === undefined ||
      typeof name !== 'string' ||
      listedIn(shown.pane, name) === undefined ||
      typeof to !== 'string' ||
      to !== path.basename(to) ||
      nameProblem(to, this.access.platform) !== undefined
    ) {
      return;
    }
    if (shown.pane.elevated === true) {
      this.host.shell().notice(page, {
        level: 'error',
        message: strings.commander.renameAsAdministrator,
      });
      return;
    }
    const { pane } = shown;
    const renamed = pane.folder;
    const from = path.join(renamed, name);
    try {
      await renameItem(from, path.join(path.dirname(from), to));
    } catch (error) {
      this.host.shell().notice(page, {
        level: 'error',
        message:
          codeOf(error) === 'EEXIST'
            ? strings.commander.nameTaken(path.join(renamed, to))
            : strings.commander.renameFailed(from, reasonOf(error)),
      });
      return;
    }
    if (pane.flat !== undefined) {
      pane.flat.tree.changed(name);
    } else if (pane.folder === renamed) {
      await this.host.list(
        page,
        shown.tab,
        shown.side,
        renamed,
        'show',
        undefined,
        to,
      );
    }
  }
}

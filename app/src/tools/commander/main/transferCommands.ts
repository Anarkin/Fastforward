import * as path from 'node:path';
import type { Sentence } from '../../../lib/shared/sentences';
import { strings } from '../../../lib/shared/strings';
import type { Page, ShellAccess } from '../../../shell/main/toolContract';
import { parentFolder, isDrop, type CommanderToHost } from '../shared/protocol';
import { otherSide, sides as bothSides, type Side } from '../shared/sides';
import { folderKey } from '../shared/paths';
import type { ConnectTransfer, TransferAsk, Transfers } from './transfers';
import { type Sides, type Listing } from './sides';
import { listedIn } from './listedEntries';
import { parentOf } from './folderPaths';
import type { ArchiveAccess } from './archives';
import type { ArchiveTransferCommands } from './archiveTransferCommands';
import { refusedTargetOnDisk } from './transferTargets';
import { nameProblem } from '../shared/names';

export interface TransferCommandsAccess {
  readonly archives?: ArchiveAccess;
  readonly platform: NodeJS.Platform;
  readonly remove?: (file: string) => Promise<void>;
  readonly connectTransfer: ConnectTransfer;
  readonly clipboardFiles?: {
    readonly read: () => Promise<readonly string[]>;
  };
}

export interface TransferCommandsHost {
  readonly shell: () => ShellAccess;
  readonly refuse: (page: Page, message: Sentence) => void;
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

export class TransferCommands {
  constructor(
    private readonly access: TransferCommandsAccess,
    private readonly sides: Sides,
    private readonly archiveTransferCommands: ArchiveTransferCommands,
    private readonly transfers: Transfers,
    private readonly host: TransferCommandsHost,
  ) {}

  dropped(page: Page, files: unknown, message: unknown): Promise<void> {
    const shown = isDrop(message)
      ? this.sides.diskPane(page, message.tab, message.side, message.folder)
      : undefined;
    if (
      shown === undefined ||
      !isDrop(message) ||
      !Array.isArray(files) ||
      files.length === 0 ||
      !files.every(
        (file: unknown) => typeof file === 'string' && path.isAbsolute(file),
      )
    ) {
      return Promise.resolve();
    }
    const { folder } = shown.pane;
    const { into, move } = message;
    const target =
      into === undefined
        ? folder
        : into === parentFolder
          ? parentOf(folder)
          : listedIn(shown.pane, into)?.folder === true
            ? path.join(folder, into)
            : undefined;
    if (target === undefined) {
      return Promise.resolve();
    }
    if (shown.pane.elevated === true) {
      this.host.refuse(page, strings.commander.transferAsAdministrator);
      return Promise.resolve();
    }
    const sources: readonly string[] = files;
    return this.startTransfer(page, {
      plan: { sources, target, move },
      folder: path.dirname(sources[0]),
      names: sources.map((source) => path.basename(source)),
    });
  }

  async transfer(
    page: Page,
    {
      tab,
      side,
      folder,
      names,
      target,
      move,
      existing,
    }: Extract<CommanderToHost, { type: 'transfer' }>,
  ): Promise<void> {
    const shown = this.sides.namingPane(page, tab, side, folder);
    const other =
      shown && this.sides.panes.get(shown.tab)?.[otherSide(shown.side)];
    if (
      shown === undefined ||
      other === undefined ||
      other.folder !== target ||
      !Array.isArray(names) ||
      names.length === 0 ||
      !names.every(
        (name: unknown) => listedIn(shown.pane, name) !== undefined,
      ) ||
      typeof move !== 'boolean'
    ) {
      return;
    }
    if (shown.pane.elevated === true || other.elevated === true) {
      this.host.refuse(page, strings.commander.transferAsAdministrator);
      return;
    }
    if (other.archive !== undefined) {
      if (shown.pane.archive === undefined) {
        await this.archiveTransferCommands.transferIn(
          page,
          shown,
          other,
          names,
          move,
          existing,
        );
      } else {
        void this.host
          .shell()
          .track(
            this.archiveTransferCommands.transferBetween(
              page,
              shown,
              other,
              names,
              move,
              existing,
            ),
          );
      }
      return;
    }
    if (shown.pane.archive !== undefined) {
      void this.host
        .shell()
        .track(
          this.archiveTransferCommands.transferOut(
            page,
            shown.pane,
            target,
            names,
            move,
          ),
        );
      return;
    }
    await this.startTransfer(page, {
      plan: {
        sources: names.map((name) => path.join(shown.pane.folder, name)),
        target,
        move,
      },
      folder: shown.pane.folder,
      names,
    });
  }

  private async startTransfer(page: Page, ask: TransferAsk): Promise<void> {
    const { sources, target, move } = ask.plan;
    const refused = await refusedTargetOnDisk(
      sources,
      target,
      this.access.platform,
      !move,
    );
    if (refused !== undefined) {
      this.host.refuse(page, refused);
      return;
    }
    this.transfers.start(ask);
  }

  async copyAs(
    page: Page,
    {
      tab,
      side,
      folder,
      name,
      target,
      to,
    }: Extract<CommanderToHost, { type: 'copyAs' }>,
  ): Promise<void> {
    const shown = this.sides.namingPane(page, tab, side, folder);
    const other =
      shown && this.sides.panes.get(shown.tab)?.[otherSide(shown.side)];
    if (
      shown === undefined ||
      other === undefined ||
      other.folder !== target ||
      typeof name !== 'string' ||
      listedIn(shown.pane, name) === undefined ||
      typeof to !== 'string' ||
      to !== path.basename(to) ||
      nameProblem(to, this.access.platform) !== undefined
    ) {
      return;
    }
    if (shown.pane.elevated === true || other.elevated === true) {
      this.host.refuse(page, strings.commander.transferAsAdministrator);
      return;
    }
    if (shown.pane.archive !== undefined || other.archive !== undefined) {
      this.host.refuse(page, strings.commander.copyAsInArchive);
      return;
    }
    await this.startTransfer(page, {
      plan: {
        sources: [path.join(shown.pane.folder, name)],
        target,
        move: false,
        as: to,
      },
      folder: shown.pane.folder,
      names: [name],
    });
  }

  async paste(
    page: Page,
    { tab, side, folder }: Extract<CommanderToHost, { type: 'paste' }>,
  ): Promise<void> {
    const shown = this.sides.diskPane(page, tab, side, folder);
    const { clipboardFiles } = this.access;
    if (shown === undefined || clipboardFiles === undefined) {
      return;
    }
    if (shown.pane.elevated === true) {
      this.host.refuse(page, strings.commander.transferAsAdministrator);
      return;
    }
    const sources = await clipboardFiles.read();
    const [first] = sources;
    if (first === undefined) {
      this.host.shell().notice(page, {
        level: 'info',
        message: strings.commander.nothingToPaste,
      });
      return;
    }
    await this.startTransfer(page, {
      plan: { sources, target: shown.pane.folder, move: false },
      folder: path.dirname(first),
      names: sources.map((source) => path.basename(source)),
    });
  }

  transferred(ask: TransferAsk): void {
    for (const [page, showing] of this.sides.shown) {
      this.transferredIn(page, showing.tab, ask);
    }
  }

  private transferredIn(
    page: Page,
    tab: string,
    { plan, folder, names, archive }: TransferAsk,
  ): void {
    const panes = this.sides.panes.get(tab);
    if (panes === undefined) {
      return;
    }
    const key = (each: string) => folderKey(each, this.access.platform);
    for (const side of archive === undefined ? [] : bothSides) {
      const pane = panes[side];
      const inside = this.access.archives?.within(pane.folder);
      if (
        archive === undefined ||
        inside === undefined ||
        key(inside.archive.file) !== key(archive.file)
      ) {
        continue;
      }
      if (pane.flat === undefined) {
        void this.host
          .shell()
          .track(
            this.host.list(
              page,
              tab,
              side,
              pane.folder,
              'show',
              undefined,
              key(pane.folder) === key(folder) ? archive.select : undefined,
            ),
          );
      } else {
        pane.flat.tree.changedAll();
      }
    }
    const changes = (each: string) =>
      (plan.move && key(each) === key(folder)) ||
      key(each) === key(plan.target);
    for (const side of bothSides) {
      const pane = panes[side];
      const { flat } = pane;
      if (!changes(pane.folder)) {
        continue;
      }
      if (flat === undefined) {
        const copied =
          plan.as !== undefined && key(pane.folder) === key(plan.target)
            ? plan.as
            : undefined;
        void this.host
          .shell()
          .track(
            this.host.list(
              page,
              tab,
              side,
              pane.folder,
              'show',
              undefined,
              copied,
            ),
          );
        continue;
      }
      if (plan.move && key(pane.folder) === key(folder)) {
        for (const name of names) {
          flat.tree.changed(name);
        }
      }
      if (key(pane.folder) === key(plan.target)) {
        for (const source of plan.sources) {
          flat.tree.changed(plan.as ?? path.basename(source));
        }
      }
    }
  }
}

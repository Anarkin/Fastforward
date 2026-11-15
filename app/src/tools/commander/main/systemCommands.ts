import * as path from 'node:path';
import { strings } from '../../../lib/shared/strings';
import type { Page, ShellAccess } from '../../../shell/main/toolContract';
import type { CommanderToHost } from '../shared/protocol';
import { type Sides } from './sides';
import { listedIn } from './listedEntries';
import type { ArchiveCopies } from './archiveCopies';
import type { CommanderAccess } from './commanderAccess';

export type SystemCommandsAccess = Pick<
  CommanderAccess,
  'clipboardFiles' | 'startDrag' | 'shellMenu'
>;

export interface SystemCommandsHost {
  readonly shell: () => ShellAccess;
}

export class SystemCommands {
  constructor(
    private readonly access: SystemCommandsAccess,
    private readonly sides: Sides,
    private readonly copies: ArchiveCopies,
    private readonly host: SystemCommandsHost,
  ) {}

  private listedFiles(
    page: Page,
    tab: unknown,
    side: unknown,
    folder: unknown,
    names: unknown,
  ): string[] | undefined {
    const shown = this.sides.diskPane(page, tab, side, folder);
    if (
      shown === undefined ||
      !Array.isArray(names) ||
      names.length === 0 ||
      !names.every((name: unknown) => listedIn(shown.pane, name) !== undefined)
    ) {
      return undefined;
    }
    return names.map((name: string) => path.join(shown.pane.folder, name));
  }

  async copyToClipboard(
    page: Page,
    {
      tab,
      side,
      folder,
      names,
    }: Extract<CommanderToHost, { type: 'copyToClipboard' }>,
  ): Promise<void> {
    const shown = this.sides.namingPane(page, tab, side, folder);
    if (
      shown?.pane.archive !== undefined &&
      Array.isArray(names) &&
      names.length > 0 &&
      names.every((name: unknown) => listedIn(shown.pane, name) !== undefined)
    ) {
      const copies = await this.copies.copiesIn(page, shown.pane, names);
      if (copies !== undefined) {
        await this.access.clipboardFiles?.write(copies);
      }
      return;
    }
    const files = this.listedFiles(page, tab, side, folder, names);
    if (files !== undefined) {
      await this.access.clipboardFiles?.write(files);
    }
  }

  async drag(
    page: Page,
    { tab, side, folder, names }: Extract<CommanderToHost, { type: 'drag' }>,
  ): Promise<void> {
    const files = this.listedFiles(page, tab, side, folder, names);
    if (files !== undefined) {
      await this.access.startDrag?.(files);
    }
  }

  async shellMenu(
    page: Page,
    {
      tab,
      side,
      folder,
      names,
      x,
      y,
      extended,
    }: Extract<CommanderToHost, { type: 'shellMenu' }>,
  ): Promise<void> {
    const shown = this.sides.diskPane(page, tab, side, folder);
    if (
      shown === undefined ||
      !Array.isArray(names) ||
      !names.every(
        (name: unknown) => listedIn(shown.pane, name) !== undefined,
      ) ||
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      typeof extended !== 'boolean'
    ) {
      return;
    }
    if (new Set(names.map((name: string) => path.dirname(name))).size > 1) {
      this.host.shell().notice(page, {
        level: 'error',
        message: strings.commander.menuOfOneFolder,
      });
      return;
    }
    await this.access.shellMenu?.(
      names.length === 0
        ? [shown.pane.folder]
        : names.map((name: string) => path.join(shown.pane.folder, name)),
      { x, y },
      extended,
    );
  }
}

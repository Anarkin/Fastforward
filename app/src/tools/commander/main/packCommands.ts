import * as fs from 'node:fs';
import * as path from 'node:path';
import { strings } from '../../../lib/shared/strings';
import type { Page } from '../../../shell/main/shell';
import type { CommanderToHost } from '../shared/protocol';
import { folderKey } from '../shared/paths';
import { archiveJob, archiveTests } from './packing';
import {
  firstVolumeOf,
  isPackFormat,
  isPackLevel,
  isZipCipher,
  packPasswordProblem,
  smallestVolume,
} from '../shared/packing';
import type { PackPlan } from './archives';
import type { Transfers } from './transfers';
import { nameProblem } from '../shared/names';
import { type Sides, listedIn } from './sides';
import type { ArchiveCopies } from './archiveCopies';
import type {
  TransferCommandsAccess,
  TransferCommandsHost,
} from './transferCommands';

export class PackCommands {
  constructor(
    private readonly access: TransferCommandsAccess,
    private readonly sides: Sides,
    private readonly copies: ArchiveCopies,
    private readonly transfers: Transfers,
    private readonly host: Pick<TransferCommandsHost, 'shell' | 'refuse'>,
  ) {}

  testArchives(
    page: Page,
    {
      tab,
      side,
      folder,
      names,
    }: Extract<CommanderToHost, { type: 'testArchives' }>,
  ): void {
    const shown = this.sides.diskPane(page, tab, side, folder);
    const { archives } = this.access;
    if (
      shown === undefined ||
      archives === undefined ||
      !Array.isArray(names) ||
      !names.every((name: unknown) => listedIn(shown.pane, name) !== undefined)
    ) {
      return;
    }
    const files = names.filter(
      (name: string) => listedIn(shown.pane, name)?.folder === false,
    );
    if (files.length === 0) {
      return;
    }
    if (shown.pane.elevated === true) {
      this.host.refuse(page, strings.commander.testAsAdministrator);
      return;
    }
    const paths = files.map((name) => path.join(shown.pane.folder, name));
    this.transfers.start(
      {
        plan: { sources: paths, target: shown.pane.folder, move: false },
        folder: shown.pane.folder,
        names: files,
        archive: { job: 'test', file: paths[0] ?? '', at: shown.pane.folder },
      },
      archiveTests(paths, async (file, options) => {
        for (;;) {
          const tested = await archives.test(file, options);
          if (tested.kind !== 'refused' || tested.needsPassword !== true) {
            return tested;
          }
          if (
            !(await this.copies.passwordGiven(
              page,
              file,
              archives.hasPassword(file),
            ))
          ) {
            return {
              kind: 'refused',
              reason: strings.commander.noPasswordGiven,
            };
          }
        }
      }),
    );
  }

  async pack(
    page: Page,
    {
      tab,
      side,
      folder,
      names,
      archive,
      format,
      level,
      password,
      encryptNames,
      zipCipher,
      volumeBytes,
      test,
      replace,
    }: Extract<CommanderToHost, { type: 'pack' }>,
  ): Promise<void> {
    const shown = this.sides.diskPane(page, tab, side, folder);
    const { archives, platform } = this.access;
    if (
      shown === undefined ||
      archives === undefined ||
      !Array.isArray(names) ||
      names.length === 0 ||
      !names.every(
        (name: unknown) => listedIn(shown.pane, name) !== undefined,
      ) ||
      typeof archive !== 'string' ||
      !path.isAbsolute(archive) ||
      nameProblem(path.basename(archive), platform) !== undefined ||
      !isPackFormat(format) ||
      !isPackLevel(level) ||
      (password !== undefined &&
        (typeof password !== 'string' ||
          packPasswordProblem(password, format) !== undefined)) ||
      (encryptNames !== undefined && typeof encryptNames !== 'boolean') ||
      (zipCipher !== undefined && !isZipCipher(zipCipher)) ||
      (volumeBytes !== undefined &&
        (!Number.isSafeInteger(volumeBytes) || volumeBytes < smallestVolume)) ||
      (test !== undefined && typeof test !== 'boolean') ||
      (replace !== undefined && typeof replace !== 'boolean')
    ) {
      return;
    }
    if (shown.pane.elevated === true) {
      this.host.shell().notice(page, {
        level: 'error',
        message: strings.commander.packAsAdministrator,
      });
      return;
    }
    const key = (each: string) => folderKey(each, platform);
    const into = names.find((name) => {
      const item = key(path.join(shown.pane.folder, name));
      return (
        key(archive) === item || key(archive).startsWith(`${item}${path.sep}`)
      );
    });
    if (into !== undefined) {
      this.host.shell().notice(page, {
        level: 'error',
        message: strings.commander.intoItself(into),
      });
      return;
    }
    const first = volumeBytes === undefined ? archive : firstVolumeOf(archive);
    if (
      replace !== true &&
      (await fs.promises.lstat(first).then(
        () => true,
        () => false,
      ))
    ) {
      this.host.shell().notice(page, {
        level: 'error',
        message: strings.commander.archiveThereKept(archive),
      });
      return;
    }
    const plan: PackPlan = {
      folder: shown.pane.folder,
      items: names,
      archive,
      format,
      level,
      ...(password !== undefined && { password }),
      ...(encryptNames !== undefined && { encryptNames }),
      ...(zipCipher !== undefined && { zipCipher }),
      ...(volumeBytes !== undefined && { volumeBytes }),
      ...(test !== undefined && { test }),
    };
    this.transfers.start(
      {
        plan: {
          sources: [archive],
          target: path.dirname(archive),
          move: false,
        },
        folder: shown.pane.folder,
        names,
        archive: { job: 'pack', file: archive },
      },
      archiveJob(path.basename(archive), (options) =>
        archives.pack(plan, options),
      ),
    );
  }
}

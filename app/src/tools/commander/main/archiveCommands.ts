import * as path from 'node:path';
import { strings } from '../../../lib/shared/strings';
import type { Sentence } from '../../../lib/shared/sentences';
import type { Page, ShellAccess } from '../../../shell/main/toolContract';
import { folderKey } from '../shared/paths';
import { archiveJob } from './archiveJobs';
import type { ArchiveJob } from '../shared/transfers';
import type { Transfers } from './transfers';
import { nameProblem } from '../shared/names';
import { type ShownPane } from './sides';
import { listedIn } from './listedEntries';
import { archiveItems } from './archiveItems';
import type { OpenedArchive } from './archives';
import type { PackOptions, Packing } from './archiveReader';
import type { CommanderAccess } from './commanderAccess';

export type ArchiveCommandsAccess = Pick<
  CommanderAccess,
  'archives' | 'platform'
>;

export interface ArchiveCommandsHost {
  readonly shell: () => ShellAccess;
  readonly refuse: (page: Page, message: Sentence) => void;
}

export class ArchiveCommands {
  constructor(
    private readonly access: ArchiveCommandsAccess,
    private readonly transfers: Transfers,
    private readonly host: ArchiveCommandsHost,
  ) {}

  deleteInArchive(page: Page, shown: ShownPane, names: unknown): void {
    const { pane } = shown;
    if (
      !Array.isArray(names) ||
      names.length === 0 ||
      !names.every((name: unknown) => listedIn(pane, name) !== undefined)
    ) {
      return;
    }
    const found = archiveItems(this.access.archives, pane, names);
    if (found === undefined) {
      return;
    }
    const { archives, archive, paths } = found;
    if (this.changeable(page, archive)) {
      this.archiveChange(shown, archive, names, 'delete', (options) =>
        archives.remove(archive, paths, options),
      );
    }
  }

  changeable(page: Page, archive: OpenedArchive): boolean {
    const refusal = this.access.archives?.unchangeable(archive);
    if (refusal === undefined) {
      return true;
    }
    this.host.refuse(page, refusal);
    return false;
  }

  private takenIn(
    page: Page,
    archive: OpenedArchive,
    inner: readonly string[],
    name: string,
    except?: string,
  ): boolean {
    const key = (each: string) => folderKey(each, this.access.platform);
    const taken =
      archive.tree
        .entries(inner)
        ?.some(
          (entry) =>
            key(entry.name) === key(name) &&
            (except === undefined || key(entry.name) !== key(except)),
        ) === true;
    if (taken) {
      this.host.shell().notice(page, {
        level: 'error',
        message: strings.commander.nameTaken(name),
      });
    }
    return taken;
  }

  private archiveChange(
    shown: ShownPane,
    archive: OpenedArchive,
    names: readonly string[],
    job: ArchiveJob,
    run: (options: PackOptions) => Promise<Packing>,
    select?: string,
  ): void {
    this.transfers.start(
      {
        plan: {
          sources: [archive.file],
          target: path.dirname(archive.file),
          move: false,
        },
        folder: shown.pane.folder,
        names,
        archive: {
          job,
          file: archive.file,
          ...(select !== undefined &&
            shown.pane.flat === undefined && { select }),
        },
      },
      archiveJob(path.basename(archive.file), run),
    );
  }

  renameInArchive(
    page: Page,
    shown: ShownPane,
    name: unknown,
    to: unknown,
  ): void {
    const { pane } = shown;
    if (
      typeof name !== 'string' ||
      listedIn(pane, name) === undefined ||
      typeof to !== 'string' ||
      to !== path.basename(to) ||
      nameProblem(to, this.access.platform) !== undefined
    ) {
      return;
    }
    const found = archiveItems(this.access.archives, pane, [name]);
    const [from] = found?.paths ?? [];
    if (found === undefined || from === undefined) {
      return;
    }
    const { archives, archive } = found;
    const parts = name.split(path.sep);
    const inner = [...found.inner, ...parts.slice(0, -1)];
    if (
      !this.changeable(page, archive) ||
      this.takenIn(page, archive, inner, to, parts.at(-1))
    ) {
      return;
    }
    const slash = from.lastIndexOf('/');
    const renamed = slash < 0 ? to : `${from.slice(0, slash)}/${to}`;
    this.archiveChange(
      shown,
      archive,
      [name],
      'rename',
      (options) => archives.rename(archive, from, renamed, options),
      to,
    );
  }

  folderInArchive(page: Page, shown: ShownPane, name: unknown): void {
    const { archives } = this.access;
    const inside = archives?.within(shown.pane.folder);
    if (
      archives === undefined ||
      inside === undefined ||
      typeof name !== 'string' ||
      name !== path.basename(name) ||
      nameProblem(name, this.access.platform) !== undefined
    ) {
      return;
    }
    const { archive, inner } = inside;
    if (
      !this.changeable(page, archive) ||
      this.takenIn(page, archive, inner, name)
    ) {
      return;
    }
    this.archiveChange(
      shown,
      archive,
      [name],
      'folder',
      (options) => archives.addFolder(archive, inner, name, options),
      name,
    );
  }
}

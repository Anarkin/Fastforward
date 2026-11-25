import { runFolderCommand } from '../../../lib/main/folderCommands';
import { isFolderCommand } from '../../../lib/shared/folderCommands';
import { fs } from '../../../lib/main/files';
import * as path from 'node:path';
import { strings } from '../../../lib/shared/strings';
import type { Page, ShellAccess } from '../../../shell/main/toolContract';
import { parentFolder, type CommanderToHost } from '../shared/protocol';
import { type Side } from '../shared/sides';
import { nameProblem } from '../shared/names';
import { type Pane, type ShownPane, type Sides, type Listing } from './sides';
import { listedIn } from './listedEntries';
import { parentOf } from './folderPaths';
import type { ArchiveCopies } from './archiveCopies';
import type { CommanderAccess } from './access';

export type FileCommandsAccess = Pick<
  CommanderAccess,
  | 'realPath'
  | 'openFile'
  | 'viewedCopies'
  | 'platform'
  | 'cloneInto'
  | 'initRepository'
  | 'editRefusal'
>;

export interface FileCommandsHost {
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

export class FileCommands {
  constructor(
    private readonly access: FileCommandsAccess,
    private readonly sides: Sides,
    private readonly copies: ArchiveCopies,
    private readonly host: FileCommandsHost,
  ) {}

  async openEntry(
    page: Page,
    shown: ShownPane | undefined,
    name: unknown,
  ): Promise<void> {
    if (shown === undefined || typeof name !== 'string') {
      return;
    }
    const { folder } = shown.pane;
    if (name === parentFolder) {
      const parent = parentOf(folder);
      if (parent !== undefined) {
        await this.host.list(page, shown.tab, shown.side, parent, 'visit');
      }
      return;
    }
    const entry = listedIn(shown.pane, name);
    if (entry === undefined) {
      return;
    }
    if (!entry.folder && shown.pane.archive !== undefined) {
      const [copy] =
        (await this.copies.copiesIn(page, shown.pane, [name])) ?? [];
      if (copy === undefined) {
        return;
      }
      const putBack = this.copies.putBackOf(folder, name, copy);
      if (putBack === undefined) {
        await fs.promises.chmod(copy, 0o444);
      } else {
        await this.copies.watchCopy(putBack, copy);
      }
      await this.openFileNamed(page, copy);
      return;
    }
    const opened = path.join(folder, name);
    if (!entry.folder) {
      await this.openFileNamed(page, opened);
      return;
    }
    const target = entry.link
      ? await this.access.realPath(opened).catch(() => undefined)
      : undefined;
    await this.host.list(
      page,
      shown.tab,
      shown.side,
      opened,
      'visit',
      target === opened ? undefined : target,
    );
  }

  private async openFileNamed(page: Page, file: string): Promise<void> {
    const failure = await this.access.openFile?.(file);
    if (failure) {
      this.host.shell().notice(page, {
        level: 'error',
        message: strings.commander.openFailed(file, failure),
      });
    }
  }

  async view(
    page: Page,
    shown: ShownPane | undefined,
    name: unknown,
  ): Promise<void> {
    const entry = listedIn(shown?.pane, name);
    if (
      shown === undefined ||
      typeof name !== 'string' ||
      entry === undefined ||
      entry.folder
    ) {
      return;
    }
    if (shown.pane.archive === undefined) {
      await this.host
        .shell()
        .openView(page, path.join(shown.pane.folder, name));
      return;
    }
    await this.copies.viewInArchive(page, shown, name);
  }

  async editFile(
    page: Page,
    shown: ShownPane | undefined,
    name: unknown,
  ): Promise<void> {
    const entry = listedIn(shown?.pane, name);
    if (
      shown === undefined ||
      typeof name !== 'string' ||
      entry === undefined
    ) {
      return;
    }
    if (!entry.folder && shown.pane.archive !== undefined) {
      await this.copies.editInArchive(page, shown, name);
      return;
    }
    const file = path.join(shown.pane.folder, name);
    const refusal = entry.folder
      ? strings.editor.folder(file)
      : shown.pane.elevated === true
        ? strings.editor.asAdministrator(file)
        : await this.access.editRefusal?.(file);
    if (refusal !== undefined) {
      this.host.shell().notice(page, { level: 'error', message: refusal });
      return;
    }
    await this.host.shell().openEdit(page, file);
  }

  async newFile(
    page: Page,
    { tab, side, folder, name }: Extract<CommanderToHost, { type: 'newFile' }>,
  ): Promise<void> {
    const shown = this.sides.namingPane(page, tab, side, folder);
    if (
      shown === undefined ||
      typeof name !== 'string' ||
      name !== path.basename(name) ||
      nameProblem(name, this.access.platform) !== undefined
    ) {
      return;
    }
    if (shown.pane.archive !== undefined) {
      await this.copies.newFileInArchive(page, shown, name);
      return;
    }
    const file = path.join(shown.pane.folder, name);
    const refusal =
      shown.pane.elevated === true
        ? strings.editor.asAdministrator(file)
        : await this.access.editRefusal?.(file);
    if (refusal !== undefined) {
      this.host.shell().notice(page, { level: 'error', message: refusal });
      return;
    }
    await this.host.shell().openEdit(page, file);
  }

  async folderCommand(
    page: Page,
    {
      tab,
      side,
      folder,
      name,
      command,
    }: Extract<CommanderToHost, { type: 'folderCommand' }>,
  ): Promise<void> {
    const shown = this.sides.diskPane(page, tab, side, folder);
    if (shown === undefined || !isFolderCommand(command)) {
      return;
    }
    const target =
      name === undefined
        ? shown.pane.folder
        : listedIn(shown.pane, name)?.folder === true
          ? path.join(shown.pane.folder, name)
          : undefined;
    if (target === undefined) {
      return;
    }
    return runFolderCommand(command, target, {
      open: (tool, at) => this.host.shell().openFolders(page, tool, [at]),
      cloneInto: async (at) => this.access.cloneInto?.(at),
      initRepository: async (at) => this.access.initRepository?.(at),
    });
  }

  openRepository(
    page: Page,
    {
      tab,
      side,
      folder,
      name,
    }: Extract<CommanderToHost, { type: 'openRepository' }>,
  ): Promise<void> {
    const shown = this.sides.diskPane(page, tab, side, folder);
    return shown === undefined ||
      typeof name !== 'string' ||
      !shown.pane.repositories.has(name)
      ? Promise.resolve()
      : this.host
          .shell()
          .openFolders(page, 'git', [path.join(shown.pane.folder, name)]);
  }

  compare(page: Page, tab: unknown, files: unknown): Promise<void> {
    if (Array.isArray(files) && files.length === 0) {
      this.host.shell().notice(page, {
        level: 'info',
        message: strings.commander.nothingToCompare,
      });
      return Promise.resolve();
    }
    if (!Array.isArray(files) || files.length < 1 || files.length > 2) {
      return Promise.resolve();
    }
    const named = files.map((file: unknown) => {
      if (typeof file !== 'object' || file === null) {
        return undefined;
      }
      const side = 'side' in file ? file.side : undefined;
      const folder = 'folder' in file ? file.folder : undefined;
      const name = 'name' in file ? file.name : undefined;
      const shown = this.sides.namingPane(page, tab, side, folder);
      const entry = listedIn(shown?.pane, name);
      return shown === undefined ||
        typeof name !== 'string' ||
        entry === undefined ||
        entry.folder
        ? undefined
        : { pane: shown.pane, name };
    });
    if (named.some((each) => each === undefined)) {
      return Promise.resolve();
    }
    const found = named.flatMap((each) => (each === undefined ? [] : [each]));
    const [lone] = found;
    return found.length === 1 && lone !== undefined
      ? this.compareHistory(page, lone)
      : this.compareFiles(page, found);
  }

  private compareHistory(
    page: Page,
    { pane, name }: { readonly pane: Pane; readonly name: string },
  ): Promise<void> {
    const file = path.join(pane.folder, name);
    if (pane.archive !== undefined) {
      this.host.shell().notice(page, {
        level: 'info',
        message: strings.diff.noEarlierVersion(file),
      });
      return Promise.resolve();
    }
    return this.host.shell().openFolders(page, 'diff', [file]);
  }

  private async compareFiles(
    page: Page,
    named: readonly { readonly pane: Pane; readonly name: string }[],
  ): Promise<void> {
    const paths: string[] = [];
    for (const { pane, name } of named) {
      const [file] =
        pane.archive === undefined
          ? [path.join(pane.folder, name)]
          : ((await this.copies.copiesIn(page, pane, [name])) ?? []);
      if (file === undefined) {
        return;
      }
      if (pane.archive !== undefined) {
        this.copies.taken(file, pane.folder, name);
      }
      paths.push(file);
    }
    const [old, changed] = paths;
    if (old === undefined || changed === undefined) {
      return;
    }
    const shell = this.host.shell();
    const comparing = shell
      .tabs()
      .find(
        (open) =>
          open.tool === 'diff' &&
          open.compare !== undefined &&
          open.compare.oldVersion === undefined &&
          open.compare.newVersion === undefined &&
          (open.compare.old !== old || open.compare.new !== changed) &&
          this.copies.sameEntry(open.compare.old, old) &&
          this.copies.sameEntry(open.compare.new, changed),
      );
    if (comparing?.compare !== undefined) {
      const before = comparing.compare;
      shell.setCompare(comparing.id, { old, new: changed });
      this.copies.replaced(before.old, old);
      this.copies.replaced(before.new, changed);
    }
    await shell.openCompare(page, { old, new: changed });
  }
}

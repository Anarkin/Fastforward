import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { strings } from '../../../lib/shared/strings';
import type { Page, ShellAccess } from '../../../shell/main/toolContract';
import { sameRoot } from '../../../lib/main/paths';
import {
  isFolderCommand,
  isTextEncoding,
  parentFolder,
  type CommanderToHost,
  type Side,
} from '../shared/protocol';
import type { Editing } from './editing';
import { nameProblem } from '../shared/names';
import {
  type Pane,
  type ShownPane,
  type Sides,
  type Listing,
  listedIn,
} from './sides';
import { parentOf } from './folderPaths';
import type { ArchiveCopies } from './archiveCopies';
import type { CommanderAccess } from './commanderAccess';

export type FileCommandsAccess = Pick<
  CommanderAccess,
  | 'realPath'
  | 'openFile'
  | 'viewedCopies'
  | 'platform'
  | 'cloneInto'
  | 'initRepository'
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
    private readonly editing: Editing,
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
      await this.openFileNamed(page, copy, name);
      return;
    }
    const opened = path.join(folder, name);
    if (!entry.folder) {
      await this.openFileNamed(page, opened, name);
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

  private async openFileNamed(
    page: Page,
    file: string,
    name: string,
  ): Promise<void> {
    const failure = await this.access.openFile?.(file);
    if (failure) {
      this.host.shell().notice(page, {
        level: 'error',
        message: strings.commander.openFailed(name, failure),
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
        .openView(page, 'commander', path.join(shown.pane.folder, name));
      return;
    }
    const { viewedCopies } = this.access;
    const [copy] =
      (await this.copies.copiesIn(
        page,
        shown.pane,
        [name],
        viewedCopies === undefined
          ? undefined
          : path.join(viewedCopies, randomUUID()),
      )) ?? [];
    if (copy !== undefined) {
      await this.host.shell().openView(page, 'commander', copy);
    }
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
      ? strings.editor.folder(name)
      : shown.pane.elevated === true
        ? strings.editor.asAdministrator(name)
        : await this.editing.refusal(file);
    if (refusal !== undefined) {
      this.host.shell().notice(page, { level: 'error', message: refusal });
      return;
    }
    await this.host.shell().openEdit(page, 'commander', file);
  }

  async editViewed(
    page: Page,
    { tab, at, encoding }: Extract<CommanderToHost, { type: 'editViewed' }>,
  ): Promise<void> {
    const viewed = this.host
      .shell()
      .tabs()
      .find((each) => each.id === tab && each.tool === 'commander');
    const file = viewed?.view === true ? viewed.root : undefined;
    if (
      file === undefined ||
      this.sides.shown.get(page)?.tab !== tab ||
      !Number.isSafeInteger(at) ||
      at < 0 ||
      (encoding !== undefined && !isTextEncoding(encoding))
    ) {
      return;
    }
    const refusal =
      this.copies.copyOf(file) === undefined
        ? await this.editing.refusal(file)
        : strings.editor.viewedCopy(path.basename(file));
    if (refusal !== undefined) {
      this.host.shell().notice(page, { level: 'error', message: refusal });
      return;
    }
    const edited = this.host
      .shell()
      .tabs()
      .some(
        (each) =>
          each.tool === 'commander' &&
          each.edit === true &&
          each.root !== undefined &&
          sameRoot(each.root, file),
      );
    if (edited) {
      await this.host.shell().openEdit(page, 'commander', file);
      return;
    }
    this.editing.startAt(tab, {
      byte: at,
      ...(encoding !== undefined && { encoding }),
    });
    await this.host.shell().editViewed(page, tab);
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
        ? strings.editor.asAdministrator(name)
        : await this.editing.refusal(file);
    if (refusal !== undefined) {
      this.host.shell().notice(page, { level: 'error', message: refusal });
      return;
    }
    await this.host.shell().openEdit(page, 'commander', file);
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
    switch (command) {
      case 'newTerminal':
        return this.host.shell().openFolders(page, 'terminal', [target]);
      case 'openInGit':
        return this.host.shell().openFolders(page, 'git', [target]);
      case 'cloneHere':
        return this.access.cloneInto?.(target);
      case 'initHere':
        return this.access.initRepository?.(target);
      default:
        return command satisfies never;
    }
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
    if (!Array.isArray(files) || files.length !== 2) {
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
    return this.compareFiles(
      page,
      named.flatMap((each) => (each === undefined ? [] : [each])),
    );
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
      paths.push(file);
    }
    const [old, changed] = paths;
    if (old !== undefined && changed !== undefined) {
      await this.host.shell().openCompare(page, 'git', { old, new: changed });
    }
  }
}

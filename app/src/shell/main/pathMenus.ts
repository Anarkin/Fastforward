import { isFolderCommand } from '../../lib/shared/folderCommands';
import { runFolderCommand } from '../../lib/main/folderCommands';
import { maxLookedPathLength } from '../../lib/shared/partLooks';
import type { PathFacts } from '../../lib/shared/pathFacts';
import type { Sentence } from '../../lib/shared/sentences';
import type { ToHost } from '../shared/protocol';
import type { Notice, Page, Tools } from './toolContract';

export interface PathOpening {
  view(page: Page, file: string): Promise<void>;
  edit(page: Page, file: string): Promise<void>;
  notice(page: Page, notice: Notice): void;
}

export interface PathMenuHost {
  pathFacts(file: string): Promise<PathFacts>;
  editRefusal(file: string): Promise<Sentence | undefined>;
  cloneInto(folder: string): Promise<void>;
  initRepository(folder: string): Promise<void>;
  shellMenu?(
    files: readonly string[],
    at: { readonly x: number; readonly y: number },
    extended: boolean,
  ): Promise<void>;
}

const isPath = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= maxLookedPathLength;

export async function answerPathFacts(
  page: Page,
  { ask, path }: Extract<ToHost, { type: 'pathFacts' }>,
  host: PathMenuHost,
): Promise<void> {
  if (typeof ask === 'number' && Number.isInteger(ask) && isPath(path)) {
    page.post({ type: 'pathFacts', ask, facts: await host.pathFacts(path) });
  }
}

export async function runPathCommand(
  page: Page,
  { path, command, x, y, extended }: Extract<ToHost, { type: 'pathCommand' }>,
  host: PathMenuHost,
  tools: Pick<Tools, 'terminal' | 'git' | 'commander' | 'diff'>,
  opening: PathOpening,
): Promise<void> {
  if (!isPath(path)) {
    return;
  }
  const facts = await host.pathFacts(path);
  if (isFolderCommand(command)) {
    return facts.kind === 'folder'
      ? runFolderCommand(command, path, {
          open: (tool, folder) => tools[tool].open(page, [folder]),
          cloneInto: (folder) => host.cloneInto(folder),
          initRepository: (folder) => host.initRepository(folder),
        })
      : Promise.resolve();
  }
  if (command === 'view' || command === 'edit') {
    if (facts.kind !== 'file') {
      return;
    }
    if (command === 'view') {
      return opening.view(page, path);
    }
    const refusal = await host.editRefusal(path);
    if (refusal !== undefined) {
      opening.notice(page, { level: 'error', message: refusal });
      return;
    }
    return opening.edit(page, path);
  }
  if (command === 'compare') {
    return facts.kind === 'file'
      ? tools.diff.open(page, [path])
      : Promise.resolve();
  }
  if (command === 'enterArchive') {
    return facts.kind === 'file'
      ? tools.commander.open(page, [path])
      : Promise.resolve();
  }
  if (
    command === 'systemMenu' &&
    (facts.kind === 'folder' || facts.kind === 'file') &&
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    typeof extended === 'boolean' &&
    x !== undefined &&
    y !== undefined
  ) {
    await host.shellMenu?.([path], { x, y }, extended);
  }
}

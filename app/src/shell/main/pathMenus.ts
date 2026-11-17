import { isFolderCommand } from '../../lib/shared/folderCommands';
import { runFolderCommand } from '../../lib/main/folderCommands';
import { maxLookedPathLength } from '../../lib/shared/partLooks';
import type { PathFacts } from '../../lib/shared/pathFacts';
import type { ToHost } from '../shared/protocol';
import type { Page, Tools } from './toolContract';

export interface PathMenuHost {
  pathFacts(file: string): Promise<PathFacts>;
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
  tools: Pick<Tools, 'terminal' | 'git' | 'commander'>,
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

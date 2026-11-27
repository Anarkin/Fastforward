import type { FolderCommand } from '../shared/folderCommands';

export interface FolderCommandRunner {
  open(tool: 'terminal' | 'commander' | 'git', folder: string): Promise<void>;
  cloneInto(folder: string): Promise<void>;
  initRepository(folder: string): Promise<void>;
  openWithSystem(folder: string): Promise<void>;
}

export function runFolderCommand(
  command: FolderCommand,
  folder: string,
  runner: FolderCommandRunner,
): Promise<void> {
  switch (command) {
    case 'newTerminal':
      return runner.open('terminal', folder);
    case 'openInCommander':
      return runner.open('commander', folder);
    case 'openInGit':
      return runner.open('git', folder);
    case 'cloneHere':
      return runner.cloneInto(folder);
    case 'initHere':
      return runner.initRepository(folder);
    case 'openWithSystem':
      return runner.openWithSystem(folder);
    default:
      return command satisfies never;
  }
}

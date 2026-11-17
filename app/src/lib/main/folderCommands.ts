import type { FolderCommand } from '../shared/folderCommands';

export interface FolderCommandRunner {
  open(tool: 'terminal' | 'git', folder: string): Promise<void>;
  cloneInto(folder: string): Promise<void>;
  initRepository(folder: string): Promise<void>;
}

export function runFolderCommand(
  command: FolderCommand,
  folder: string,
  runner: FolderCommandRunner,
): Promise<void> {
  switch (command) {
    case 'newTerminal':
      return runner.open('terminal', folder);
    case 'openInGit':
      return runner.open('git', folder);
    case 'cloneHere':
      return runner.cloneInto(folder);
    case 'initHere':
      return runner.initRepository(folder);
    default:
      return command satisfies never;
  }
}

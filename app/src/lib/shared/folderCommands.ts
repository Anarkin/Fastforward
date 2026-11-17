const folderCommands = [
  'newTerminal',
  'openInCommander',
  'openInGit',
  'cloneHere',
  'initHere',
] as const;

export type FolderCommand = (typeof folderCommands)[number];

export function isFolderCommand(value: unknown): value is FolderCommand {
  return folderCommands.some((command) => command === value);
}

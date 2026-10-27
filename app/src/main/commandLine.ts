import * as path from 'node:path';

const switchTerminator = '--';
const terminalSwitch = '--term';

export function foldersOf(
  argv: readonly string[],
  fromSource: boolean,
  startedIn: string,
): string[] {
  const args = argv.slice(1);
  const terminator = args.indexOf(switchTerminator);
  const positional = beforeTerminator(args).filter(
    (arg) => !arg.startsWith('-'),
  );
  const folders = [
    ...(fromSource ? positional.slice(1) : positional),
    ...(terminator === -1 ? [] : args.slice(terminator + 1)),
  ];
  return folders.map((folder) => path.resolve(startedIn, folder));
}

export function handOff(folders: readonly string[]): {
  readonly folders: readonly string[];
} {
  return { folders };
}

export function foldersHandedOff(data: unknown): string[] {
  if (typeof data !== 'object' || data === null || !('folders' in data)) {
    return [];
  }
  const { folders } = data;
  return Array.isArray(folders)
    ? folders.filter(
        (folder): folder is string =>
          typeof folder === 'string' && path.isAbsolute(folder),
      )
    : [];
}

export function wantsTerminal(argv: readonly string[]): boolean {
  return beforeTerminator(argv.slice(1)).includes(terminalSwitch);
}

function beforeTerminator(args: readonly string[]): readonly string[] {
  const terminator = args.indexOf(switchTerminator);
  return terminator === -1 ? args : args.slice(0, terminator);
}

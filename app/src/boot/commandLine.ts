import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const switchTerminator = '--';

export function foldersOf(
  argv: readonly string[],
  fromSource: boolean,
  startedIn: string,
): string[] {
  const args = argv.slice(1);
  const terminator = args.indexOf(switchTerminator);
  const beforeTerminator = terminator === -1 ? args : args.slice(0, terminator);
  const positional = beforeTerminator.filter((arg) => !arg.startsWith('-'));
  const folders = [
    ...(fromSource ? positional.slice(1) : positional),
    ...(terminator === -1 ? [] : args.slice(terminator + 1)),
  ];
  return folders.map((folder) => folderOf(folder, startedIn));
}

function folderOf(arg: string, startedIn: string): string {
  if (arg.startsWith('file://')) {
    try {
      return fileURLToPath(arg);
    } catch {
      return path.resolve(startedIn, arg);
    }
  }
  return path.resolve(startedIn, arg);
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

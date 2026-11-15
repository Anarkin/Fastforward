import * as path from 'node:path';
import type { IParser } from '@xterm/headless';

export interface FolderPlace {
  readonly platform: NodeJS.Platform;
  readonly hostname: string;
}

const drivePath = /^\/(?:cygdrive\/)?([a-z]):?(?:\/(.*))?$/is;

const devicePath = /^\\\\[.?]\\/;

const shareRoot = /^\\\\([^\\]+)\\/;

export function folderOfPath(
  reported: string,
  { platform }: FolderPlace,
): string | undefined {
  const folder = /^"(.*)"$/s.exec(reported)?.[1] ?? reported;
  if (platform !== 'win32') {
    return path.posix.isAbsolute(folder)
      ? path.posix.normalize(folder)
      : undefined;
  }
  const drive = drivePath.exec(folder);
  const windowsFolder = drive
    ? `${drive[1].toUpperCase()}:\\${drive[2] ?? ''}`
    : folder;
  const normalized = path.win32.normalize(windowsFolder);
  return path.win32.isAbsolute(windowsFolder) &&
    path.win32.parse(windowsFolder).root.length > 1 &&
    !devicePath.test(normalized)
    ? normalized
    : undefined;
}

export function serverOf(
  folder: string,
  { platform }: FolderPlace,
): string | undefined {
  return platform === 'win32'
    ? shareRoot.exec(path.win32.normalize(folder))?.[1].toLowerCase()
    : undefined;
}

export function folderOfUrl(
  reported: string,
  place: FolderPlace,
): string | undefined {
  let url: URL;
  let pathname: string;
  try {
    url = new URL(reported);
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return undefined;
  }
  const local = ['', 'localhost', place.hostname.toLowerCase()];
  return url.protocol === 'file:' && local.includes(url.hostname)
    ? folderOfPath(pathname, place)
    : undefined;
}

export function reportFolders(
  parser: IParser,
  place: FolderPlace,
  tell: (folder: string) => void,
): (cwd: string) => void {
  let startedOn: string | undefined;
  const reported = (folder: string | undefined): boolean => {
    if (folder === undefined) {
      return true;
    }
    const server = serverOf(folder, place);
    if (server === undefined || server === startedOn) {
      tell(folder);
    }
    return true;
  };
  parser.registerOscHandler(7, (data) => reported(folderOfUrl(data, place)));
  parser.registerOscHandler(9, (data) =>
    reported(
      data.startsWith('9;') ? folderOfPath(data.slice(2), place) : undefined,
    ),
  );
  return (cwd) => {
    startedOn = serverOf(cwd, place);
  };
}

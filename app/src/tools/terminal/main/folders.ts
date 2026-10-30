import * as path from 'node:path';

export interface FolderPlace {
  readonly platform: NodeJS.Platform;
  readonly hostname: string;
}

const drivePath = /^\/(?:cygdrive\/)?([a-z]):?(?:\/(.*))?$/is;

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
  return path.win32.isAbsolute(windowsFolder) &&
    path.win32.parse(windowsFolder).root.length > 1
    ? path.win32.normalize(windowsFolder)
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

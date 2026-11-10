import * as path from 'node:path';

export function profileFolder(
  development: boolean,
  given: string,
  appData: string,
): string | undefined {
  return (
    given || (development ? path.join(appData, 'Fastforward Dev') : undefined)
  );
}

function localFolder(
  platform: NodeJS.Platform,
  development: boolean,
  given: string,
  home: string,
  env: NodeJS.ProcessEnv,
  named: string,
): string {
  if (given) {
    return path.join(given, named);
  }
  const name = development ? 'Fastforward Dev' : 'Fastforward';
  switch (platform) {
    case 'win32':
      return path.join(
        env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'),
        name,
        named,
      );
    case 'darwin':
      return path.join(home, 'Library', 'Caches', name, named);
    default:
      return path.join(
        env.XDG_CACHE_HOME || path.join(home, '.cache'),
        name.toLowerCase().replace(' ', '-'),
        named.toLowerCase().replace(' ', '-'),
      );
  }
}

export function thumbnailFolder(
  platform: NodeJS.Platform,
  development: boolean,
  given: string,
  home: string,
  env: NodeJS.ProcessEnv,
): string {
  return localFolder(platform, development, given, home, env, 'Thumbnails');
}

export function archivesFolder(
  platform: NodeJS.Platform,
  development: boolean,
  given: string,
  home: string,
  env: NodeJS.ProcessEnv,
): string {
  return localFolder(platform, development, given, home, env, 'Archives');
}

export function viewedFilesFolder(
  platform: NodeJS.Platform,
  development: boolean,
  given: string,
  home: string,
  env: NodeJS.ProcessEnv,
): string {
  return given
    ? path.join(given, 'viewed-files')
    : localFolder(platform, development, given, home, env, 'Viewed Files');
}

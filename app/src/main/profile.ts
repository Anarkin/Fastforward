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

export function thumbnailFolder(
  platform: NodeJS.Platform,
  development: boolean,
  given: string,
  home: string,
  env: NodeJS.ProcessEnv,
): string {
  if (given) {
    return path.join(given, 'Thumbnails');
  }
  const name = development ? 'Fastforward Dev' : 'Fastforward';
  switch (platform) {
    case 'win32':
      return path.join(
        env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'),
        name,
        'Thumbnails',
      );
    case 'darwin':
      return path.join(home, 'Library', 'Caches', name, 'Thumbnails');
    default:
      return path.join(
        env.XDG_CACHE_HOME || path.join(home, '.cache'),
        name.toLowerCase().replace(' ', '-'),
        'thumbnails',
      );
  }
}

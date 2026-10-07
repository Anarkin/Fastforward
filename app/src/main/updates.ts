import * as fs from 'node:fs';
import * as path from 'node:path';

export function checksForUpdates(
  development: boolean,
  platform: NodeJS.Platform,
  executable: string,
  exists: (file: string) => boolean = fs.existsSync,
): boolean {
  if (development || platform === 'darwin') {
    return false;
  }
  return (
    platform !== 'win32' ||
    exists(
      path.win32.join(
        path.win32.dirname(executable),
        'Uninstall Fastforward.exe',
      ),
    )
  );
}

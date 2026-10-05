import * as fs from 'node:fs';
import * as path from 'node:path';

// Squirrel.Mac only installs updates signed with the app's Developer ID, and
// the macOS app is only ad-hoc signed; on Windows only the installer leaves an
// uninstaller next to the app, and an update from the zip or the portable exe
// would install a second copy instead
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

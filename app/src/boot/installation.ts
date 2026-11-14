import * as fs from 'node:fs';
import * as path from 'node:path';

export type UpdateMode = 'install' | 'notify' | 'off';

export function updateMode(
  development: boolean,
  platform: NodeJS.Platform,
  executable: string,
  exists: (file: string) => boolean = fs.existsSync,
  env: NodeJS.ProcessEnv = process.env,
  writable: (folder: string) => boolean = canWrite,
): UpdateMode {
  if (development) {
    return 'off';
  }
  if (platform === 'darwin') {
    return 'notify';
  }
  if (platform !== 'win32' && runsAsAppImage(executable, env)) {
    return writable(path.posix.dirname(env.APPIMAGE ?? ''))
      ? 'install'
      : 'notify';
  }
  const installed =
    platform === 'win32'
      ? installedOnWindows(executable, exists)
      : exists(
          path.posix.join(
            path.posix.dirname(executable),
            'resources',
            'package-type',
          ),
        );
  return installed ? 'install' : 'off';
}

export function installedOnWindows(
  executable: string,
  exists: (file: string) => boolean = fs.existsSync,
): boolean {
  return exists(
    path.win32.join(
      path.win32.dirname(executable),
      'Uninstall Fastforward.exe',
    ),
  );
}

function canWrite(folder: string): boolean {
  try {
    fs.accessSync(folder, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export function runsAsAppImage(
  executable: string,
  env: NodeJS.ProcessEnv,
): boolean {
  const { APPIMAGE, APPDIR } = env;
  if (APPIMAGE === undefined || APPDIR === undefined) {
    return false;
  }
  const inside = path.posix.relative(APPDIR, executable);
  return (
    inside !== '' &&
    inside !== '..' &&
    !inside.startsWith('../') &&
    !path.posix.isAbsolute(inside)
  );
}

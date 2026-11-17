import * as fs from 'node:fs';
import * as path from 'node:path';

const windows = process.platform === 'win32';

function holds(folder: string, program: string): boolean {
  return fs.existsSync(path.join(folder, windows ? `${program}.exe` : program));
}

export function searchedWithoutGh(
  searched: string,
  notSignedIn: string,
  inFolder: (folder: string, program: string) => boolean = holds,
  onWindows = windows,
): string {
  const folders = searched.split(path.delimiter);
  return (
    onWindows
      ? folders.filter(
          (folder) =>
            !inFolder(folder, 'gh') ||
            inFolder(folder, 'git') ||
            inFolder(folder, 'node'),
        )
      : [notSignedIn, ...folders]
  ).join(path.delimiter);
}

export function withoutGh(
  env: NodeJS.ProcessEnv,
  shims: string,
): NodeJS.ProcessEnv {
  const notSignedIn = path.join(shims, 'gh-not-signed-in');
  if (!fs.existsSync(notSignedIn)) {
    fs.mkdirSync(notSignedIn, { recursive: true });
    fs.writeFileSync(path.join(notSignedIn, 'gh'), '#!/bin/sh\nexit 4\n', {
      mode: 0o755,
    });
  }
  const searched =
    Object.keys(env).find((name) => name.toUpperCase() === 'PATH') ?? 'PATH';
  const without = {
    ...env,
    [searched]: searchedWithoutGh(env[searched] ?? '', notSignedIn),
  };
  delete without.GH_REPO;
  return without;
}

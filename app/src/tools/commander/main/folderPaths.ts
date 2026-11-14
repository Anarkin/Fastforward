import * as path from 'node:path';

export function childToward(folder: string, from: string): string | undefined {
  const relative = path.relative(folder, from);
  return relative === '' ||
    relative.startsWith('..') ||
    path.isAbsolute(relative)
    ? undefined
    : relative.split(path.sep)[0];
}

export function rootFolder(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
): string {
  return platform === 'win32' ? `${env.SystemDrive ?? 'C:'}\\` : '/';
}

export function parentOf(folder: string): string | undefined {
  const parent = path.dirname(folder);
  return parent === folder ? undefined : parent;
}

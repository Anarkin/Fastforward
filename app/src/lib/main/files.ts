import * as nodeFs from 'node:fs';
import { createRequire } from 'node:module';

export type { BigIntStats, Dirent, FSWatcher, Stats } from 'node:fs';
export type { FileHandle } from 'node:fs/promises';

type FileSystem = typeof nodeFs;

function isFileSystem(value: unknown): value is FileSystem {
  return (
    typeof value === 'object' &&
    value !== null &&
    'promises' in value &&
    'readFileSync' in value
  );
}

export function filesWithoutAsar(
  electron: string | undefined = process.versions.electron,
  load: (name: string) => unknown = createRequire(process.execPath),
): FileSystem {
  if (electron === undefined) {
    return nodeFs;
  }
  const loaded = load('original-fs');
  if (!isFileSystem(loaded)) {
    throw new Error('Electron gave no original-fs to read files with');
  }
  return loaded;
}

export const fs: FileSystem = filesWithoutAsar();

export const fsPromises: FileSystem['promises'] = fs.promises;

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Entry } from '../shared/protocol';
import type { FileSystem } from './fileSystem';

async function statsOf(
  file: string,
  follow: boolean,
): Promise<fs.Stats | undefined> {
  try {
    return await (follow ? fs.promises.stat(file) : fs.promises.lstat(file));
  } catch {
    return undefined;
  }
}

async function entryOf(folder: string, found: fs.Dirent): Promise<Entry> {
  const link = found.isSymbolicLink();
  const stats = await statsOf(path.join(folder, found.name), link);
  const isFolder = stats?.isDirectory() ?? found.isDirectory();
  return {
    name: found.name,
    folder: isFolder,
    link,
    hidden: found.name.startsWith('.'),
    size: stats === undefined || isFolder ? undefined : stats.size,
    modified: stats?.mtimeMs,
  };
}

export const nodeFileSystem: FileSystem = {
  async list(folder) {
    const found = await fs.promises.readdir(folder, { withFileTypes: true });
    return Promise.all(found.map((each) => entryOf(folder, each)));
  },
  drives: () => Promise.resolve([]),
};

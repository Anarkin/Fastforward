import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Entry } from '../shared/protocol';
import type { LocalFileSystem } from './fileSystem';

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

const anyoneRuns = 0o111;

async function entryOf(folder: string, found: fs.Dirent): Promise<Entry> {
  const link = found.isSymbolicLink();
  const stats = await statsOf(path.join(folder, found.name), link);
  const isFolder = stats?.isDirectory() ?? found.isDirectory();
  const unixFile =
    process.platform !== 'win32' && stats !== undefined && !isFolder;
  return {
    name: found.name,
    folder: isFolder,
    link,
    hidden: found.name.startsWith('.'),
    size: stats === undefined || isFolder ? undefined : stats.size,
    modified: stats?.mtimeMs,
    ...(unixFile && stats.size > 0 && stats.blocks === 0 && { online: true }),
    ...(unixFile && (stats.mode & anyoneRuns) !== 0 && { executable: true }),
  };
}

export const nodeFileSystem: LocalFileSystem = {
  async list(folder) {
    const found = await fs.promises.readdir(folder, { withFileTypes: true });
    return Promise.all(found.map((each) => entryOf(folder, each)));
  },
  drives: () => Promise.resolve([]),
  hidden: (file) => Promise.resolve(path.basename(file).startsWith('.')),
};

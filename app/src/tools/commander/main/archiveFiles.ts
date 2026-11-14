import * as fs from 'node:fs';
import * as path from 'node:path';

export async function removed(folder: string): Promise<void> {
  await fs.promises
    .rm(folder, { recursive: true, force: true, maxRetries: 3 })
    .catch(() => undefined);
}

export async function linkedTree(from: string, to: string): Promise<void> {
  const stats = await fs.promises.stat(from);
  if (stats.isDirectory()) {
    await fs.promises.mkdir(to);
    for (const name of await fs.promises.readdir(from)) {
      await linkedTree(path.join(from, name), path.join(to, name));
    }
    await fs.promises.utimes(to, stats.atime, stats.mtime);
    return;
  }
  try {
    await fs.promises.link(from, to);
  } catch {
    await fs.promises.copyFile(from, to, fs.constants.COPYFILE_EXCL);
    await fs.promises.utimes(to, stats.atime, stats.mtime);
  }
}

export const firstVolume = /\.0{2,}1$/;

export async function temporariesOf(file: string): Promise<string[]> {
  const folder = path.dirname(file);
  const name = `${path.basename(file)}.tmp`;
  const names = await fs.promises.readdir(folder).catch(() => []);
  return names
    .filter((each) => each.startsWith(name))
    .map((each) => path.join(folder, each));
}

function running(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error instanceof Error && 'code' in error && error.code === 'EPERM';
  }
}

const runName = /^\d+$/;

function removedWhole(folder: string): Promise<void> {
  return fs.promises
    .rm(folder, { recursive: true, force: true, maxRetries: 3 })
    .catch(() => undefined);
}

export function workFolders(
  base: string,
  pid: number = process.pid,
  alive: (pid: number) => boolean = running,
): {
  readonly next: () => Promise<string>;
  readonly clear: () => Promise<void>;
  readonly clearEnded: () => Promise<void>;
} {
  const root = path.join(base, String(pid));
  return {
    next: async () => {
      await fs.promises.mkdir(root, { recursive: true, mode: 0o700 });
      return fs.promises.mkdtemp(path.join(root, 'work-'));
    },
    clear: () => removedWhole(root),
    clearEnded: async () => {
      const names = await fs.promises.readdir(base).catch(() => []);
      await Promise.all(
        names
          .filter(
            (name) =>
              runName.test(name) &&
              Number(name) !== pid &&
              !alive(Number(name)),
          )
          .map((name) => removedWhole(path.join(base, name))),
      );
    },
  };
}

export const tarName = /\.tar$/i;

export async function filesUnder(folder: string): Promise<string[]> {
  const found = await fs.promises
    .readdir(folder, { recursive: true, withFileTypes: true })
    .catch(() => []);
  return found
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name));
}

export async function itemsAt(
  folder: string,
  depth: number,
): Promise<string[]> {
  let at = folder;
  for (let level = 0; level < depth; level++) {
    const [only] = await fs.promises.readdir(at).catch(() => []);
    if (only === undefined) {
      return [];
    }
    at = path.join(at, only);
  }
  const found = await fs.promises.readdir(at).catch(() => []);
  return found.map((name) => path.join(at, name));
}

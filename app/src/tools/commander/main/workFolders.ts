import * as fs from 'node:fs';
import * as path from 'node:path';

export async function removed(folder: string): Promise<void> {
  await fs.promises
    .rm(folder, { recursive: true, force: true, maxRetries: 3 })
    .catch(() => undefined);
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
    clear: () => removed(root),
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
          .map((name) => removed(path.join(base, name))),
      );
    },
  };
}

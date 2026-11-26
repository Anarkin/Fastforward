import { hasCode } from '../../../lib/shared/errors';
import { fs } from '../../../lib/main/files';
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
    return hasCode(error, 'EPERM');
  }
}

const runName = /^\d+$/;

const markName = '.fastforward-copy.json';

export interface KeptCopy {
  readonly copy: string;
  readonly archive: string;
  readonly name: string;
}

interface Mark extends KeptCopy {
  readonly stamp: string | undefined;
  readonly told?: true;
}

const stampOf = (copy: string): Promise<string | undefined> =>
  fs.promises.stat(copy).then(
    (stats) => `${stats.size}:${stats.mtimeMs}`,
    () => undefined,
  );

function isMark(value: unknown): value is Mark {
  return (
    typeof value === 'object' &&
    value !== null &&
    'copy' in value &&
    typeof value.copy === 'string' &&
    'archive' in value &&
    typeof value.archive === 'string' &&
    'name' in value &&
    typeof value.name === 'string'
  );
}

async function markOf(work: string): Promise<Mark | undefined> {
  try {
    const read: unknown = JSON.parse(
      await fs.promises.readFile(path.join(work, markName), 'utf8'),
    );
    return isMark(read) ? read : undefined;
  } catch {
    return undefined;
  }
}

async function writeMark(work: string, mark: Mark): Promise<void> {
  await fs.promises.writeFile(path.join(work, markName), JSON.stringify(mark));
}

export async function markCopy(
  copy: string,
  archive: string,
  name: string,
): Promise<void> {
  await writeMark(path.dirname(copy), {
    copy,
    archive,
    name,
    stamp: await stampOf(copy),
  });
}

async function keptWhenChanged(work: string): Promise<KeptCopy | undefined> {
  const mark = await markOf(work);
  if (mark === undefined || (await stampOf(mark.copy)) === mark.stamp) {
    await removed(work);
    return undefined;
  }
  if (mark.told === true) {
    return undefined;
  }
  await writeMark(work, { ...mark, told: true });
  return { copy: mark.copy, archive: mark.archive, name: mark.name };
}

async function worksIn(run: string): Promise<string[]> {
  const names = await fs.promises.readdir(run).catch(() => []);
  return names.map((name) => path.join(run, name));
}

export function workFolders(
  base: string,
  pid: number = process.pid,
  alive: (pid: number) => boolean = running,
): {
  readonly next: () => Promise<string>;
  readonly clear: () => Promise<void>;
  readonly clearEnded: () => Promise<readonly KeptCopy[]>;
} {
  const root = path.join(base, String(pid));
  return {
    next: async () => {
      await fs.promises.mkdir(root, { recursive: true, mode: 0o700 });
      return fs.promises.mkdtemp(path.join(root, 'work-'));
    },
    clear: async () => {
      for (const work of await worksIn(root)) {
        if ((await markOf(work)) === undefined) {
          await removed(work);
        }
      }
      await fs.promises.rmdir(root).catch(() => undefined);
    },
    clearEnded: async () => {
      const names = await fs.promises.readdir(base).catch(() => []);
      const kept: KeptCopy[] = [];
      for (const name of names) {
        if (
          !runName.test(name) ||
          Number(name) === pid ||
          alive(Number(name))
        ) {
          continue;
        }
        const run = path.join(base, name);
        for (const work of await worksIn(run)) {
          const changed = await keptWhenChanged(work);
          if (changed !== undefined) {
            kept.push(changed);
          }
        }
        await fs.promises.rmdir(run).catch(() => undefined);
      }
      return kept;
    },
  };
}

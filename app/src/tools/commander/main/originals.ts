import { fs } from '../../../lib/main/files';
import type { BigIntStats } from '../../../lib/main/files';
import * as path from 'node:path';
import { unlinked } from './deletion';

export interface Stock {
  readonly remove: () => Promise<readonly string[]>;
}

interface Original {
  readonly item: string;
  readonly folder: boolean;
  readonly stats: BigIntStats;
}

const lstatOf = (item: string): Promise<BigIntStats | undefined> =>
  fs.promises.lstat(item, { bigint: true }).catch(() => undefined);

const codeOf = (error: unknown): unknown =>
  error instanceof Error && 'code' in error ? error.code : undefined;

async function originalsOf(item: string, found: Original[]): Promise<void> {
  const stats = await lstatOf(item);
  if (stats === undefined) {
    return;
  }
  const folder = stats.isDirectory();
  if (folder) {
    const names = await fs.promises.readdir(item).catch(() => []);
    for (const name of names) {
      await originalsOf(path.join(item, name), found);
    }
  }
  found.push({ item, folder, stats });
}

const unchanged = (was: BigIntStats, now: BigIntStats): boolean =>
  was.ino === now.ino &&
  was.dev === now.dev &&
  was.size === now.size &&
  was.mtimeNs === now.mtimeNs;

async function removedOriginal({
  item,
  folder,
  stats,
}: Original): Promise<boolean> {
  if (folder) {
    try {
      await fs.promises.rmdir(item);
      return true;
    } catch (error) {
      const code = codeOf(error);
      if (code === 'ENOENT') {
        return true;
      }
      if (code === 'ENOTEMPTY' || code === 'EEXIST') {
        return false;
      }
      throw error;
    }
  }
  const now = await lstatOf(item);
  if (now === undefined) {
    return true;
  }
  if (!unchanged(stats, now)) {
    return false;
  }
  await unlinked(item);
  return true;
}

export async function stockOf(item: string): Promise<Stock> {
  const originals: Original[] = [];
  await originalsOf(item, originals);
  return {
    remove: async () => {
      const kept: string[] = [];
      for (const original of originals) {
        if (!(await removedOriginal(original))) {
          kept.push(original.item);
        }
      }
      return kept;
    },
  };
}

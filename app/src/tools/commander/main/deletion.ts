import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TransferProgress } from '../shared/transfers';
import { reasonOf } from '../../../lib/main/reasons';
import type { TransferEnd } from './transfer';

export interface DeletionEvents {
  readonly progress: (progress: TransferProgress) => void;
  readonly failed: (name: string, reason: string) => void;
}

export interface DeletionOptions {
  readonly stopped: () => boolean;
  readonly now?: () => number;
  readonly progressEvery?: number;
}

interface Item {
  readonly item: string;
  readonly folder: boolean;
  readonly bytes: number;
}

const codeOf = (error: unknown): unknown =>
  error instanceof Error && 'code' in error ? error.code : undefined;

async function itemsUnder(item: string, found: Item[]): Promise<void> {
  const stats = await fs.promises.lstat(item).catch(() => undefined);
  if (stats === undefined) {
    return;
  }
  if (stats.isDirectory()) {
    const names = await fs.promises.readdir(item).catch(() => []);
    for (const name of names) {
      await itemsUnder(path.join(item, name), found);
    }
    found.push({ item, folder: true, bytes: 0 });
    return;
  }
  found.push({
    item,
    folder: false,
    bytes: stats.isFile() ? stats.size : 0,
  });
}

export async function unlinked(item: string): Promise<void> {
  try {
    await fs.promises.unlink(item);
  } catch (error) {
    const code = codeOf(error);
    if (process.platform === 'win32' && code === 'EPERM') {
      const stats = await fs.promises.lstat(item).catch(() => undefined);
      if (stats?.isSymbolicLink() === true) {
        await fs.promises.rmdir(item).catch(() => fs.promises.unlink(item));
        return;
      }
      await fs.promises.chmod(item, 0o666).catch(() => undefined);
      await fs.promises.unlink(item);
      return;
    }
    if (code === 'EISDIR') {
      await fs.promises.rmdir(item);
      return;
    }
    throw error;
  }
}

export async function runDeletion(
  sources: readonly string[],
  events: DeletionEvents,
  { stopped, now = Date.now, progressEvery = 100 }: DeletionOptions,
): Promise<TransferEnd> {
  const items: Item[] = [];
  for (const source of sources) {
    if (stopped()) {
      return 'stopped';
    }
    await itemsUnder(source, items);
  }
  const files = items.filter((each) => !each.folder);
  const totalFiles = files.length;
  const totalBytes = files.reduce((sum, each) => sum + each.bytes, 0);
  let done = 0;
  let bytes = 0;
  let reported = Number.NEGATIVE_INFINITY;
  const report = (current: string | undefined, always = false) => {
    const at = now();
    if (always || at - reported >= progressEvery) {
      reported = at;
      events.progress({
        files: done,
        totalFiles,
        bytes,
        totalBytes,
        ...(current !== undefined && { current }),
      });
    }
  };
  report(undefined, true);
  const failedUnder = new Set<string>();
  const root = path.dirname(sources[0] ?? '');
  const failed = (item: string, error: unknown) => {
    events.failed(path.relative(root, item), reasonOf(error));
    for (let up = path.dirname(item); up !== root; up = path.dirname(up)) {
      if (failedUnder.has(up) || up === path.dirname(up)) {
        break;
      }
      failedUnder.add(up);
    }
  };
  for (const { item, folder, bytes: size } of items) {
    if (stopped()) {
      report(undefined, true);
      return 'stopped';
    }
    if (folder) {
      if (failedUnder.has(item)) {
        continue;
      }
      try {
        await fs.promises.rmdir(item);
      } catch (error) {
        if (codeOf(error) !== 'ENOENT') {
          failed(item, error);
        }
      }
      continue;
    }
    report(item);
    try {
      await unlinked(item);
    } catch (error) {
      if (codeOf(error) !== 'ENOENT') {
        failed(item, error);
      }
    }
    done += 1;
    bytes += size;
  }
  report(undefined, true);
  return 'done';
}

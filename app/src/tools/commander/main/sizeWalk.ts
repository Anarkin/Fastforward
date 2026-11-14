import * as path from 'node:path';
import type { Entry } from '../shared/protocol';

export interface SizeWalk {
  readonly folders: readonly string[];
  readonly asked: boolean;
}

export interface SizeWalked {
  readonly bytes: number;
  readonly unread: number;
  readonly unreadable: boolean;
  readonly rest: readonly string[];
}

export interface SizeWalker {
  walk(walk: SizeWalk, signal: AbortSignal): Promise<SizeWalked>;
}

export interface SizeRead {
  readonly bytes: number;
  readonly folders: readonly string[];
}

export type SizeReader = (
  folder: string,
) => SizeRead | undefined | Promise<SizeRead | undefined>;

export async function walkFolders(
  { folders, asked }: SizeWalk,
  read: SizeReader,
  budgetMillis: number,
  signal?: AbortSignal,
  now: () => number = () => performance.now(),
): Promise<SizeWalked> {
  const until = now() + budgetMillis;
  const stopped = () => signal?.aborted === true;
  const stack = folders.toReversed();
  let bytes = 0;
  let unread = 0;
  let unreadable = false;
  let first = true;
  do {
    const folder = stack.pop();
    if (folder === undefined) {
      break;
    }
    const found = await read(folder);
    if (found === undefined && first && asked) {
      unreadable = true;
    } else if (found === undefined) {
      unread++;
    } else {
      bytes += found.bytes;
      stack.push(...found.folders.toReversed());
    }
    first = false;
  } while (stack.length > 0 && now() < until && !stopped());
  return { bytes, unread, unreadable, rest: stack.toReversed() };
}

export function listingWalker(
  list: (folder: string) => Promise<readonly Entry[]>,
): SizeWalker {
  const read = async (folder: string): Promise<SizeRead | undefined> => {
    let entries: readonly Entry[];
    try {
      entries = await list(folder);
    } catch {
      return undefined;
    }
    let bytes = 0;
    const folders: string[] = [];
    for (const entry of entries) {
      if (entry.link) {
        continue;
      }
      if (entry.folder) {
        folders.push(path.join(folder, entry.name));
      } else {
        bytes += entry.size ?? 0;
      }
    }
    return { bytes, folders };
  };
  return { walk: (walk, signal) => walkFolders(walk, read, 0, signal) };
}

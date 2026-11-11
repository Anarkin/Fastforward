import { createHash } from 'node:crypto';
import { closeSync, fstatSync, openSync, readSync } from 'node:fs';
import type { ContentReader } from './duplicates';

const chunkBytes = 1024 * 1024;

export interface Hashed {
  readonly hash: string;
  readonly id: string;
  readonly size: number;
}

export function hashOf(file: string, bytes: number | undefined): Hashed {
  const handle = openSync(file, 'r');
  try {
    const stats = fstatSync(handle, { bigint: true });
    const hash = createHash('sha256');
    const limit = bytes ?? Number.POSITIVE_INFINITY;
    const buffer = Buffer.allocUnsafe(Math.min(chunkBytes, limit));
    for (let read = 0; read < limit;) {
      const wanted = Math.min(buffer.length, limit - read);
      const got = readSync(handle, buffer, 0, wanted, read);
      if (got === 0) {
        break;
      }
      hash.update(buffer.subarray(0, got));
      read += got;
    }
    return {
      hash: hash.digest('hex'),
      id: `${stats.dev}:${stats.ino}`,
      size: Number(stats.size),
    };
  } finally {
    closeSync(handle);
  }
}

export const hashingHere: ContentReader = {
  hash: (file, bytes, signal) => {
    if (signal.aborted) {
      return Promise.resolve(undefined);
    }
    try {
      return Promise.resolve(hashOf(file, bytes));
    } catch {
      return Promise.resolve(undefined);
    }
  },
};

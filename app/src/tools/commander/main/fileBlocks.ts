import * as fs from 'node:fs';

export const blockBytes = 64 * 1024;

export type ReadBytes = (position: number, length: number) => Promise<Buffer>;

export async function readingFile<T>(
  file: string,
  withRead: (read: ReadBytes) => Promise<T>,
): Promise<T> {
  const handle = await fs.promises.open(file, 'r');
  try {
    return await withRead(async (position, length) => {
      const buffer = Buffer.alloc(length);
      const { bytesRead } = await handle.read(buffer, 0, length, position);
      return buffer.subarray(0, bytesRead);
    });
  } finally {
    await handle.close();
  }
}

const cachedBlocks = 64;

export interface BlockCache {
  readonly reader: (read: ReadBytes) => ReadBytes;
  readonly forget: () => void;
}

function blockAt(
  into: Map<number, Promise<Buffer>>,
  read: ReadBytes,
  index: number,
): Promise<Buffer> {
  const known = into.get(index);
  if (known !== undefined) {
    into.delete(index);
    into.set(index, known);
    return known;
  }
  const reading = read(index * blockBytes, blockBytes);
  reading.catch(() => {
    if (into.get(index) === reading) {
      into.delete(index);
    }
  });
  into.set(index, reading);
  const oldest = into.keys().next().value;
  if (into.size > cachedBlocks && oldest !== undefined) {
    into.delete(oldest);
  }
  return reading;
}

export function blockCache(): BlockCache {
  let blocks = new Map<number, Promise<Buffer>>();
  return {
    reader: (read) => {
      const into = blocks;
      return async (position, length) => {
        if (length <= 0) {
          return Buffer.alloc(0);
        }
        const first = Math.floor(position / blockBytes);
        const last = Math.floor((position + length - 1) / blockBytes);
        const parts = await Promise.all(
          Array.from({ length: last - first + 1 }, (_, index) =>
            blockAt(into, read, first + index),
          ),
        );
        const offset = position - first * blockBytes;
        const [only] = parts;
        const joined =
          parts.length === 1 && only !== undefined
            ? only
            : Buffer.concat(parts);
        return joined.subarray(offset, offset + length);
      };
    },
    forget: () => {
      blocks = new Map();
    },
  };
}

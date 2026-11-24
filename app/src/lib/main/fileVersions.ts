import { createHash } from 'node:crypto';
import { fs } from './files';

const sampledBytes = 64 * 1024;

interface FileStats {
  readonly ino: number;
  readonly size: number;
  readonly mtimeMs: number;
  readonly ctimeMs: number;
  readonly birthtimeMs: number;
}

const statsVersion = (stats: FileStats) =>
  `${stats.ino}:${stats.size}:${stats.mtimeMs}:${stats.ctimeMs}:${stats.birthtimeMs}`;

export function bytesVersion(bytes: Uint8Array): string {
  return `${bytes.length}:${createHash('sha256').update(bytes).digest('base64url')}`;
}

export async function sampledVersion(
  file: string,
  stats: FileStats,
): Promise<string> {
  const hash = createHash('sha256');
  const handle = await fs.promises.open(file, 'r');
  try {
    const head = Buffer.alloc(Math.min(sampledBytes, stats.size));
    const { bytesRead } = await handle.read(head, 0, head.length, 0);
    hash.update(head.subarray(0, bytesRead));
    const tailLength = Math.min(sampledBytes, stats.size - head.length);
    if (tailLength > 0) {
      const tail = Buffer.alloc(tailLength);
      const read = await handle.read(
        tail,
        0,
        tailLength,
        stats.size - tailLength,
      );
      hash.update(tail.subarray(0, read.bytesRead));
    }
  } finally {
    await handle.close();
  }
  return `${statsVersion(stats)}:${hash.digest('base64url')}`;
}

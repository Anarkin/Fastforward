import { createReadStream } from 'node:fs';
import { lstat } from 'node:fs/promises';
import { stampOf } from './fileStamps';
import { isBinary, maxFileSize } from './files';

async function addedLines(file: string): Promise<number | 'tooLarge'> {
  let lines = 0;
  let last = 0x0a;
  let first = true;
  try {
    const stats = await lstat(file);
    if (stats.isSymbolicLink()) {
      return 1;
    }
    if (!stats.isFile()) {
      return 0;
    }
    for await (const chunk of createReadStream(file)) {
      if (!(chunk instanceof Buffer)) {
        continue;
      }
      if (first && isBinary(chunk)) {
        return 0;
      }
      if (stats.size > maxFileSize) {
        return 'tooLarge';
      }
      first = false;
      for (
        let i = chunk.indexOf(0x0a);
        i !== -1;
        i = chunk.indexOf(0x0a, i + 1)
      ) {
        lines++;
      }
      last = chunk.at(-1) ?? last;
    }
  } catch {
    return 0;
  }
  return last === 0x0a ? lines : lines + 1;
}

type Counted = number | 'tooLarge';

export class LineCounts {
  private readonly known = new Map<
    string,
    { readonly stamp: string; readonly lines: Counted }
  >();

  constructor(
    private readonly maxFiles: number,
    private readonly count: (file: string) => Promise<Counted> = addedLines,
  ) {}

  async of(file: string): Promise<Counted> {
    const stats = await lstat(file).catch(() => undefined);
    if (stats === undefined) {
      return this.count(file);
    }
    const stamp = stampOf(stats, false);
    const known = this.known.get(file);
    const lines = known?.stamp === stamp ? known.lines : await this.count(file);
    this.known.delete(file);
    this.known.set(file, { stamp, lines });
    for (const oldest of this.known.keys()) {
      if (this.known.size <= this.maxFiles) {
        break;
      }
      this.known.delete(oldest);
    }
    return lines;
  }
}

export const untrackedLines = new LineCounts(10_000);

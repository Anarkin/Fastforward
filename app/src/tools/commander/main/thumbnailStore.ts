import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

const keyPattern = /^[\da-f]{64}$/;

const largestStore = 256 * 1024 * 1024;

const keptShare = 0.9;

export function thumbnailKey(
  file: string,
  size: number,
  modified: number,
  box: number,
  pixelRatio: number,
): string {
  return createHash('sha256')
    .update(JSON.stringify([file, size, modified, box, pixelRatio]))
    .digest('hex');
}

export class ThumbnailStore {
  private stored: number | undefined;

  constructor(
    private readonly folder: string,
    private readonly limit = largestStore,
  ) {}

  async read(key: string): Promise<Uint8Array | undefined> {
    if (!keyPattern.test(key)) {
      return undefined;
    }
    const file = this.fileOf(key);
    try {
      const bytes = await fs.promises.readFile(file);
      const now = new Date();
      await fs.promises.utimes(file, now, now).catch(() => undefined);
      return new Uint8Array(bytes);
    } catch {
      return undefined;
    }
  }

  async write(key: string, bytes: Uint8Array): Promise<void> {
    if (!keyPattern.test(key)) {
      return;
    }
    await fs.promises.mkdir(this.folder, { recursive: true });
    const file = this.fileOf(key);
    const temporary = `${file}.${process.pid}.tmp`;
    await fs.promises.writeFile(temporary, bytes);
    await fs.promises.rename(temporary, file);
    this.stored = (this.stored ?? (await this.measured())) + bytes.length;
    if (this.stored > this.limit) {
      await this.trim();
    }
  }

  private fileOf(key: string): string {
    return path.join(this.folder, `${key}.webp`);
  }

  private async kept(): Promise<
    { readonly file: string; readonly size: number; readonly used: number }[]
  > {
    const names = await fs.promises.readdir(this.folder).catch(() => []);
    const kept = await Promise.all(
      names
        .filter((name) => name.endsWith('.webp'))
        .map(async (name) => {
          const file = path.join(this.folder, name);
          const stats = await fs.promises.stat(file).catch(() => undefined);
          return stats && { file, size: stats.size, used: stats.mtimeMs };
        }),
    );
    return kept.filter((each) => each !== undefined);
  }

  private async measured(): Promise<number> {
    return (await this.kept()).reduce((sum, each) => sum + each.size, 0);
  }

  private async trim(): Promise<void> {
    const kept = (await this.kept()).toSorted((a, b) => a.used - b.used);
    let stored = kept.reduce((sum, each) => sum + each.size, 0);
    for (const each of kept) {
      if (stored <= this.limit * keptShare) {
        break;
      }
      await fs.promises.rm(each.file, { force: true });
      stored -= each.size;
    }
    this.stored = stored;
  }
}

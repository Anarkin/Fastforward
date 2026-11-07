import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

const keyPattern = /^[\da-f]{64}$/;

const largestStore = 256 * 1024 * 1024;

const keptShare = 0.9;

const temporaryEnding = '.tmp';

let writes = 0;

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
  private measuring: Promise<number> | undefined;
  private readonly writing = new Map<string, Promise<void>>();

  constructor(
    private readonly folder: string,
    private readonly limit: () => number = () => largestStore,
  ) {}

  async has(key: string): Promise<boolean> {
    if (!keyPattern.test(key)) {
      return false;
    }
    try {
      await fs.promises.access(this.fileOf(key));
      return true;
    } catch {
      return false;
    }
  }

  async full(): Promise<boolean> {
    return (await this.storedNow()) >= this.limit();
  }

  private async storedNow(): Promise<number> {
    this.measuring ??= this.measured();
    this.stored ??= await this.measuring;
    return this.stored;
  }

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

  write(key: string, bytes: Uint8Array): Promise<void> {
    if (!keyPattern.test(key)) {
      return Promise.resolve();
    }
    const running = this.writing.get(key);
    if (running !== undefined) {
      return running;
    }
    const written = this.written(key, bytes).finally(() =>
      this.writing.delete(key),
    );
    this.writing.set(key, written);
    return written;
  }

  private async written(key: string, bytes: Uint8Array): Promise<void> {
    await fs.promises.mkdir(this.folder, { recursive: true });
    const file = this.fileOf(key);
    const temporary = `${file}.${process.pid}.${++writes}${temporaryEnding}`;
    try {
      await fs.promises.writeFile(temporary, bytes);
      await fs.promises.rename(temporary, file);
    } catch (error) {
      await fs.promises.rm(temporary, { force: true }).catch(() => undefined);
      throw error;
    }
    this.stored = (await this.storedNow()) + bytes.length;
    if (this.stored > this.limit()) {
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
    const names = await fs.promises.readdir(this.folder).catch(() => []);
    await Promise.all(
      names
        .filter((name) => name.endsWith(temporaryEnding))
        .map((name) =>
          fs.promises
            .rm(path.join(this.folder, name), { force: true })
            .catch(() => undefined),
        ),
    );
    return (await this.kept()).reduce((sum, each) => sum + each.size, 0);
  }

  private async trim(): Promise<void> {
    const kept = (await this.kept()).toSorted((a, b) => a.used - b.used);
    let stored = kept.reduce((sum, each) => sum + each.size, 0);
    for (const each of kept) {
      if (stored <= this.limit() * keptShare) {
        break;
      }
      await fs.promises.rm(each.file, { force: true });
      stored -= each.size;
    }
    this.stored = stored;
  }
}

import type { Size } from '../../../lib/page/imageSizes';
import { workers } from './thumbnailWorkers';
import { workerCount } from '../shared/workers';

export interface Thumbnail extends Size {
  readonly url: string;
  readonly made?: Blob;
}

type Make = (
  url: string,
  box: number,
  pixelRatio: number,
) => Promise<Thumbnail | undefined>;

interface Entry {
  readonly url: string;
  readonly box: number;
  readonly pixelRatio: number;
  readonly loading: Promise<Thumbnail | undefined>;
  readonly settle: (thumbnail: Thumbnail | undefined) => void;
  settled?: Thumbnail;
  started: boolean;
  holders: number;
}

interface Held {
  readonly loading: Promise<Thumbnail | undefined>;
  release(): void;
}

export const thumbnailKey = (url: string, box: number, pixelRatio: number) =>
  `${box} ${pixelRatio} ${url}`;

export class ThumbnailCache {
  private readonly entries = new Map<string, Entry>();
  private readonly waiting: string[] = [];
  private running = 0;

  constructor(
    private readonly make: Make,
    private readonly revoke: (url: string) => void,
    private readonly limit = 500,
    private readonly parallel = workerCount,
  ) {}

  peek(url: string, box: number, pixelRatio: number): Thumbnail | undefined {
    return this.entries.get(thumbnailKey(url, box, pixelRatio))?.settled;
  }

  hold(url: string, box: number, pixelRatio: number): Held {
    const key = thumbnailKey(url, box, pixelRatio);
    const entry =
      this.entries.get(key) ?? this.added(key, url, box, pixelRatio);
    this.entries.delete(key);
    this.entries.set(key, entry);
    entry.holders++;
    this.pump();
    return {
      loading: entry.loading,
      release: () => {
        entry.holders--;
        queueMicrotask(() => this.evict());
      },
    };
  }

  private added(
    key: string,
    url: string,
    box: number,
    pixelRatio: number,
  ): Entry {
    const { promise: loading, resolve: settle } = Promise.withResolvers<
      Thumbnail | undefined
    >();
    const entry: Entry = {
      url,
      box,
      pixelRatio,
      loading,
      settle,
      started: false,
      holders: 0,
    };
    this.entries.set(key, entry);
    this.waiting.push(key);
    return entry;
  }

  private pump(): void {
    while (this.running < this.parallel && this.waiting.length > 0) {
      const key = this.waiting.shift() ?? '';
      const entry = this.entries.get(key);
      if (entry === undefined || entry.started) {
        continue;
      }
      if (entry.holders === 0) {
        this.entries.delete(key);
        entry.settle(undefined);
        continue;
      }
      entry.started = true;
      this.running++;
      void this.make(entry.url, entry.box, entry.pixelRatio)
        .catch(() => undefined)
        .then((thumbnail) => {
          this.running--;
          if (thumbnail === undefined) {
            this.entries.delete(key);
          } else {
            entry.settled = thumbnail;
          }
          entry.settle(thumbnail);
          this.evict();
          this.pump();
        });
    }
  }

  private evict(): void {
    let count = [...this.entries.values()].filter(
      (entry) => entry.settled !== undefined,
    ).length;
    for (const [key, entry] of this.entries) {
      if (count <= this.limit) {
        return;
      }
      if (entry.settled !== undefined && entry.holders === 0) {
        this.entries.delete(key);
        this.revoke(entry.settled.url);
        count--;
      }
    }
  }
}

async function madeThumbnail(
  url: string,
  box: number,
  pixelRatio: number,
): Promise<Thumbnail | undefined> {
  const { made } = await workers.make(url, box, pixelRatio, false);
  return (
    made && {
      url: URL.createObjectURL(made.image),
      width: made.width,
      height: made.height,
      ...(made.fresh && { made: made.image }),
    }
  );
}

export const thumbnails = new ThumbnailCache(madeThumbnail, (url) =>
  URL.revokeObjectURL(url),
);

import { useEffect, useRef } from 'react';
import { usePixelRatio, type Size } from '../../../lib/page/imageSizes';
import type {
  FillOutcome,
  FromThumbnailWorker,
  ToThumbnailWorker,
} from './thumbnailMessages';

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

const workerCount = 4;

export const keyOf = (url: string, box: number, pixelRatio: number) =>
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
    return this.entries.get(keyOf(url, box, pixelRatio))?.settled;
  }

  hold(url: string, box: number, pixelRatio: number): Held {
    const key = keyOf(url, box, pixelRatio);
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

export interface WorkerLike {
  postMessage(message: ToThumbnailWorker): void;
  addEventListener(
    type: 'message' | 'error',
    listener: (event: MessageEvent<FromThumbnailWorker>) => void,
  ): void;
  removeEventListener(
    type: 'message' | 'error',
    listener: (event: MessageEvent<FromThumbnailWorker>) => void,
  ): void;
}

interface Job {
  readonly message: ToThumbnailWorker;
  readonly answer: (answer: FromThumbnailWorker) => void;
}

const fillingWorkers = 2;

export class ThumbnailWorkers {
  private readonly idle: WorkerLike[] = [];
  private readonly shown: Job[] = [];
  private readonly filling: Job[] = [];
  private started = 0;
  private fillsRunning = 0;
  private asked = 0;

  constructor(
    private readonly create: () => WorkerLike = () =>
      new Worker(new URL('thumbnailWorker.js', location.href), {
        type: 'module',
      }),
    private readonly size = workerCount,
    private readonly fillLimit = fillingWorkers,
  ) {}

  make(
    url: string,
    box: number,
    pixelRatio: number,
    filling: boolean,
  ): Promise<FromThumbnailWorker> {
    const id = ++this.asked;
    const { promise, resolve } = Promise.withResolvers<FromThumbnailWorker>();
    (filling ? this.filling : this.shown).push({
      message: { id, url, box, pixelRatio, filling },
      answer: resolve,
    });
    this.assign();
    return promise;
  }

  private assign(): void {
    for (;;) {
      const job =
        this.shown.shift() ??
        (this.fillsRunning < this.fillLimit ? this.filling.shift() : undefined);
      if (job === undefined) {
        return;
      }
      const worker =
        this.idle.pop() ??
        (this.started < this.size ? this.newWorker() : undefined);
      if (worker === undefined) {
        (job.message.filling ? this.filling : this.shown).unshift(job);
        return;
      }
      this.run(worker, job);
    }
  }

  private newWorker(): WorkerLike {
    this.started++;
    return this.create();
  }

  private run(worker: WorkerLike, job: Job): void {
    const { id, filling } = job.message;
    if (filling) {
      this.fillsRunning++;
    }
    const done = (answer: FromThumbnailWorker) => {
      worker.removeEventListener('message', answered);
      worker.removeEventListener('error', failed);
      if (filling) {
        this.fillsRunning--;
      }
      this.idle.push(worker);
      job.answer(answer);
      this.assign();
    };
    const answered = ({ data }: MessageEvent<FromThumbnailWorker>) => {
      if (data.id === id) {
        done(data);
      }
    };
    const failed = () => done({ id });
    worker.addEventListener('message', answered);
    worker.addEventListener('error', failed);
    worker.postMessage(job.message);
  }
}

const workers = new ThumbnailWorkers();

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

export function fillOrder(count: number, from: number): number[] {
  const start = from >= 0 && from < count ? from : 0;
  return Array.from({ length: count }, (_, index) => (start + index) % count);
}

type Filled = FillOutcome | 'made' | 'failed';

export class ThumbnailFiller<T> {
  private queue: T[] = [];
  private readonly running = new Set<T>();
  private readonly done = new Set<T>();

  constructor(
    private readonly make: (item: T) => Promise<Filled>,
    private readonly parallel = fillingWorkers,
  ) {}

  start(items: readonly T[]): void {
    this.queue = items.filter(
      (item) => !this.done.has(item) && !this.running.has(item),
    );
    this.pump();
  }

  stop(): void {
    this.queue = [];
  }

  private pump(): void {
    while (this.running.size < this.parallel && this.queue.length > 0) {
      const item = this.queue.shift();
      if (item === undefined) {
        return;
      }
      this.running.add(item);
      void this.make(item)
        .catch((): Filled => 'failed')
        .then((outcome) => {
          this.running.delete(item);
          this.done.add(item);
          if (outcome === 'full') {
            this.queue = [];
          }
          this.pump();
        });
    }
  }
}

export const thumbnails = new ThumbnailCache(madeThumbnail, (url) =>
  URL.revokeObjectURL(url),
);

export interface FillItem {
  readonly url: string;
  readonly name: string;
}

interface Filling<Item> {
  readonly items: readonly Item[];
  readonly box: number;
  readonly pixelRatio: number;
  readonly filler: ThumbnailFiller<Item>;
}

export function useThumbnailFill<Item extends FillItem>(
  items: readonly Item[],
  from: number,
  box: number,
  filling: boolean,
  onMade: (item: Item, made: Blob, pixelRatio: number) => void,
): void {
  const pixelRatio = usePixelRatio();
  const made = useRef(onMade);
  const kept = useRef<Filling<Item>>(undefined);
  useEffect(() => {
    made.current = onMade;
  }, [onMade]);
  useEffect(() => {
    if (!filling) {
      return undefined;
    }
    const before = kept.current;
    const { filler } =
      before !== undefined &&
      before.items === items &&
      before.box === box &&
      before.pixelRatio === pixelRatio
        ? before
        : (kept.current = {
            items,
            box,
            pixelRatio,
            filler: new ThumbnailFiller<Item>(async (item) => {
              if (thumbnails.peek(item.url, box, pixelRatio) !== undefined) {
                return 'stored';
              }
              const answer = await workers.make(
                item.url,
                box,
                pixelRatio,
                true,
              );
              if (answer.made?.fresh === true) {
                made.current(item, answer.made.image, pixelRatio);
              }
              return answer.outcome ?? (answer.made ? 'made' : 'failed');
            }),
          });
    filler.start(fillOrder(items.length, from).map((index) => items[index]));
    return () => filler.stop();
  }, [items, box, pixelRatio, from, filling]);
}

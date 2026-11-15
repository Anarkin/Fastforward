import { useEffect, useRef } from 'react';
import { usePixelRatio } from '../../../lib/page/imageSizes';
import { thumbnails } from './thumbnailCache';
import type { FillOutcome } from './thumbnailMessages';
import { fillingWorkers, workers } from './thumbnailWorkers';

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

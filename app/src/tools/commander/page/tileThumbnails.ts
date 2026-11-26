import type { Thumbnail } from './thumbnailCache';

interface Held {
  readonly loading: Promise<Thumbnail | undefined>;
  release(): void;
}

export interface ThumbnailSource {
  readonly hold: (url: string, box: number, pixelRatio: number) => Held;
  readonly peek: (
    url: string,
    box: number,
    pixelRatio: number,
  ) => Thumbnail | undefined;
}

interface Holding {
  readonly held: Held;
  shown: Thumbnail | null | undefined;
}

type Made = (made: Blob, pixelRatio: number) => void;

export class TileThumbnails {
  private readonly holding = new Map<string, Holding>();
  private readonly handedOver = new WeakSet<Blob>();

  constructor(
    private readonly source: ThumbnailSource,
    private readonly came: () => void,
  ) {}

  shown(
    url: string,
    box: number,
    pixelRatio: number,
    onMade: Made,
  ): Thumbnail | null | undefined {
    const key = thumbnailKey(url, box, pixelRatio);
    const holding = this.holding.get(key);
    if (holding !== undefined) {
      return holding.shown;
    }
    const held = this.source.hold(url, box, pixelRatio);
    const made: Holding = {
      held,
      shown: this.source.peek(url, box, pixelRatio),
    };
    this.holding.set(key, made);
    void held.loading.then((thumbnail) => {
      if (this.holding.get(key) !== made) {
        return;
      }
      made.shown = thumbnail ?? null;
      const blob = thumbnail?.made;
      if (blob !== undefined && !this.handedOver.has(blob)) {
        this.handedOver.add(blob);
        onMade(blob, pixelRatio);
      }
      this.came();
    });
    return made.shown;
  }

  keep(keys: ReadonlySet<string>): void {
    for (const [key, holding] of this.holding) {
      if (!keys.has(key)) {
        holding.held.release();
        this.holding.delete(key);
      }
    }
  }

  dispose(): void {
    this.keep(new Set());
  }
}

export const thumbnailKey = (url: string, box: number, pixelRatio: number) =>
  `${box} ${pixelRatio} ${url}`;

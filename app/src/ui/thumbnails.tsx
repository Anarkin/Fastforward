import { useEffect, useRef, useState } from 'react';
import { usePixelRatio, type Size } from './images';

export interface Thumbnail extends Size {
  readonly url: string;
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

export function fittedSize(natural: Size, box: number): Size {
  const scale = Math.min(1, box / Math.max(natural.width, natural.height, 1));
  return {
    width: Math.max(1, Math.round(natural.width * scale)),
    height: Math.max(1, Math.round(natural.height * scale)),
  };
}

const keyOf = (url: string, box: number, pixelRatio: number) =>
  `${box} ${pixelRatio} ${url}`;

export class ThumbnailCache {
  private readonly entries = new Map<string, Entry>();
  private readonly waiting: string[] = [];
  private running = 0;

  constructor(
    private readonly make: Make,
    private readonly revoke: (url: string) => void,
    private readonly limit = 500,
    private readonly parallel = 2,
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

async function madeThumbnail(
  url: string,
  box: number,
  pixelRatio: number,
): Promise<Thumbnail | undefined> {
  const response = await fetch(url);
  if (!response.ok) {
    return undefined;
  }
  const bitmap = await createImageBitmap(await response.blob());
  try {
    const shown = fittedSize(bitmap, box);
    const canvas = new OffscreenCanvas(
      Math.max(1, Math.round(shown.width * pixelRatio)),
      Math.max(1, Math.round(shown.height * pixelRatio)),
    );
    const context = canvas.getContext('2d');
    if (context === null) {
      return undefined;
    }
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await canvas.convertToBlob({ type: 'image/webp' });
    return { url: URL.createObjectURL(blob), ...shown };
  } finally {
    bitmap.close();
  }
}

const thumbnails = new ThumbnailCache(madeThumbnail, (url) =>
  URL.revokeObjectURL(url),
);

function useInView(element: React.RefObject<Element | null>): boolean {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const target = element.current;
    if (!target) {
      return undefined;
    }
    const observer = new IntersectionObserver((seen) => {
      setInView(seen.some((each) => each.isIntersecting));
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [element]);
  return inView;
}

function useThumbnail(
  url: string,
  box: number,
  inView: boolean,
): Thumbnail | undefined | null {
  const pixelRatio = usePixelRatio();
  const key = keyOf(url, box, pixelRatio);
  const [shown, setShown] = useState<{
    readonly key: string;
    readonly thumbnail: Thumbnail | null;
  }>();
  useEffect(() => {
    if (!inView) {
      return undefined;
    }
    let live = true;
    const held = thumbnails.hold(url, box, pixelRatio);
    void held.loading.then((thumbnail) => {
      if (live) {
        setShown({ key, thumbnail: thumbnail ?? null });
      }
    });
    return () => {
      live = false;
      held.release();
    };
  }, [url, box, pixelRatio, key, inView]);
  return shown?.key === key
    ? shown.thumbnail
    : thumbnails.peek(url, box, pixelRatio);
}

function RasterThumbnail({
  url,
  box,
  fallback,
}: {
  url: string;
  box: number;
  fallback: React.ReactNode;
}) {
  const slot = useRef<HTMLSpanElement>(null);
  const thumbnail = useThumbnail(url, box, useInView(slot));
  return (
    <span
      className="thumbnail-slot"
      ref={slot}
      style={{ width: box, height: box }}
    >
      {thumbnail === null
        ? fallback
        : thumbnail && (
            <img
              className="thumbnail-image"
              src={thumbnail.url}
              alt=""
              draggable={false}
              style={{ width: thumbnail.width, height: thumbnail.height }}
            />
          )}
    </span>
  );
}

function VectorThumbnail({
  url,
  box,
  fallback,
}: {
  url: string;
  box: number;
  fallback: React.ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return fallback;
  }
  return (
    <img
      className="thumbnail-image"
      src={url}
      alt=""
      draggable={false}
      style={{ maxWidth: box, maxHeight: box }}
      onError={() => setFailed(true)}
    />
  );
}

export function ThumbnailImage({
  url,
  box,
  vector,
  fallback,
}: {
  url: string;
  box: number;
  vector: boolean;
  fallback: React.ReactNode;
}) {
  return vector ? (
    <VectorThumbnail url={url} box={box} fallback={fallback} />
  ) : (
    <RasterThumbnail url={url} box={box} fallback={fallback} />
  );
}

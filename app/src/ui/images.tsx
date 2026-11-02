import {
  useEffect,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
} from 'react';
import { imageType, maxImageSize } from '../shared/images';
import { strings } from '../shared/strings';
import { watchDevicePixels } from './devicePixels';

const scheme = /^[a-z][a-z\d+.-]*:/i;

export function documentImagePath(
  document: string,
  src: string,
): string | undefined {
  const slashed = src.replaceAll('\\', '/');
  if (scheme.test(slashed) || slashed.startsWith('//')) {
    return undefined;
  }
  let target: string;
  try {
    target = decodeURIComponent(slashed.split(/[?#]/)[0] ?? '').replaceAll(
      '\\',
      '/',
    );
  } catch {
    return undefined;
  }
  const parts = target.startsWith('/') ? [] : document.split('/').slice(0, -1);
  for (const part of target.split('/')) {
    if (part === '..') {
      if (parts.length === 0) {
        return undefined;
      }
      parts.pop();
    } else if (part !== '' && part !== '.') {
      parts.push(part);
    }
  }
  const path = parts.join('/');
  return imageType(path) === undefined ? undefined : path;
}

export type LoadedImage =
  | { readonly kind: 'loaded'; readonly url: string; readonly bytes: number }
  | { readonly kind: 'tooLarge' | 'failed' };

interface ObjectUrls {
  create(blob: Blob): string;
  revoke(url: string): void;
}

interface Entry {
  readonly loading: Promise<LoadedImage>;
  settled?: LoadedImage;
  holders: number;
}

interface Held {
  readonly loading: Promise<LoadedImage>;
  release(): void;
}

const cachedBytes = 256 * 1024 * 1024;

export class ImageCache {
  private readonly entries = new Map<string, Entry>();
  private bytes = 0;

  constructor(
    private readonly fetchImage: (url: string) => Promise<Response> = (url) =>
      fetch(url),
    private readonly urls: ObjectUrls = {
      create: (blob) => URL.createObjectURL(blob),
      revoke: (url) => URL.revokeObjectURL(url),
    },
    private readonly limit = cachedBytes,
  ) {}

  peek(url: string): LoadedImage | undefined {
    return this.entries.get(url)?.settled;
  }

  load(url: string): Promise<LoadedImage> {
    return this.entry(url).loading;
  }

  hold(url: string): Held {
    const entry = this.entry(url);
    entry.holders++;
    return {
      loading: entry.loading,
      release: () => {
        entry.holders--;
        queueMicrotask(() => this.evict());
      },
    };
  }

  private entry(url: string): Entry {
    const cached = this.entries.get(url);
    if (cached) {
      this.entries.delete(url);
      this.entries.set(url, cached);
      return cached;
    }
    const entry: Entry = {
      holders: 0,
      loading: this.fetchNow(url).then((image) => {
        if (image.kind === 'failed') {
          this.entries.delete(url);
        } else {
          entry.settled = image;
          if (image.kind === 'loaded') {
            this.bytes += image.bytes;
            this.evict(url);
          }
        }
        return image;
      }),
    };
    this.entries.set(url, entry);
    return entry;
  }

  private async fetchNow(url: string): Promise<LoadedImage> {
    try {
      const response = await this.fetchImage(url);
      if (response.status === 413) {
        return { kind: 'tooLarge' };
      }
      if (!response.ok) {
        return { kind: 'failed' };
      }
      const blob = await response.blob();
      return { kind: 'loaded', url: this.urls.create(blob), bytes: blob.size };
    } catch {
      return { kind: 'failed' };
    }
  }

  private evict(kept?: string): void {
    for (const [url, entry] of this.entries) {
      if (this.bytes <= this.limit) {
        return;
      }
      if (
        url !== kept &&
        entry.holders === 0 &&
        entry.settled?.kind === 'loaded'
      ) {
        this.entries.delete(url);
        this.bytes -= entry.settled.bytes;
        this.urls.revoke(entry.settled.url);
      }
    }
  }
}

const images = new ImageCache();

function useLoadedImage(
  url: string | undefined,
  cache = images,
): LoadedImage | undefined {
  const [shown, setShown] = useState(() => ({
    url,
    image: url === undefined ? undefined : cache.peek(url),
  }));
  useEffect(() => {
    if (url === undefined) {
      return undefined;
    }
    let live = true;
    const held = cache.hold(url);
    void held.loading.then((image) => {
      if (live) {
        setShown({ url, image });
      }
    });
    return () => {
      live = false;
      held.release();
    };
  }, [url, cache]);
  return shown.url === url ? shown.image : undefined;
}

export function WholeImage({ url }: { url: string }) {
  return (
    <div className="image-diff">
      <ImagePane key={url} url={url} />
    </div>
  );
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

export function realSizeOf(
  natural: Size,
  pixelRatio: number,
  vector: boolean,
): Size {
  return vector
    ? natural
    : {
        width: natural.width / pixelRatio,
        height: natural.height / pixelRatio,
      };
}

const subscribeToPixelRatio = (onChange: () => void) =>
  watchDevicePixels(onChange);

function usePixelRatio(): number {
  return useSyncExternalStore(
    subscribeToPixelRatio,
    () => window.devicePixelRatio,
    () => 1,
  );
}

export interface RealSize {
  readonly vector: boolean;
  readonly onShown: () => void;
}

export function ImagePane({
  url,
  realSize,
}: {
  url: string;
  realSize?: RealSize;
}) {
  const image = useLoadedImage(url);
  const [size, setSize] = useState<Size>();
  const [broken, setBroken] = useState(false);
  const pixelRatio = usePixelRatio();
  const shown =
    realSize === undefined || size === undefined || size.width === 0
      ? undefined
      : realSizeOf(size, pixelRatio, realSize.vector);
  const shownWidth = shown?.width;
  const shownHeight = shown?.height;
  const onShown = realSize?.onShown;
  useLayoutEffect(() => {
    if (shownWidth !== undefined && shownHeight !== undefined) {
      onShown?.();
    }
  }, [shownWidth, shownHeight, onShown]);
  const note =
    image?.kind === 'tooLarge'
      ? strings.diff.imageTooLarge(maxImageSize / 1024 / 1024)
      : image?.kind === 'failed' || broken
        ? strings.diff.imageFailed
        : undefined;
  return (
    <div className="image-pane">
      {note !== undefined ? (
        <div className="image-note">{note}</div>
      ) : (
        image?.kind === 'loaded' && (
          <div className="image-frame">
            <img
              src={image.url}
              alt=""
              className={
                realSize === undefined
                  ? undefined
                  : realSize.vector
                    ? 'real-size'
                    : 'real-size device-pixels'
              }
              style={shown}
              title={
                size &&
                strings.diff.imageDetails(size.width, size.height, image.bytes)
              }
              draggable={false}
              onLoad={(event) =>
                setSize({
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight,
                })
              }
              onError={() => setBroken(true)}
            />
          </div>
        )
      )}
    </div>
  );
}

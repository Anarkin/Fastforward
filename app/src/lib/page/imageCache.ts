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

import { useEffect, useState } from 'react';

export interface PaneImages {
  readonly generation: number;
  readonly get: (url: string | undefined) => HTMLImageElement | undefined;
  readonly failed: (url: string) => boolean;
  readonly keep: (used: ReadonlySet<string>) => void;
}

interface Redrawn {
  readonly redraw: () => void;
}

export class ImageCache implements PaneImages {
  generation = 0;
  private readonly images = new Map<
    string,
    HTMLImageElement | 'loading' | 'failed'
  >();
  private gone = false;

  constructor(private readonly drawn: Redrawn) {}

  get(url: string | undefined): HTMLImageElement | undefined {
    if (url === undefined) {
      return undefined;
    }
    const known = this.images.get(url);
    if (known !== undefined) {
      return known === 'loading' || known === 'failed' ? undefined : known;
    }
    this.images.set(url, 'loading');
    const image = new Image();
    image.src = url;
    void image.decode().then(
      () => {
        if (!this.gone && this.images.get(url) === 'loading') {
          this.images.set(url, image);
          this.generation++;
          this.drawn.redraw();
        }
      },
      () => {
        if (!this.gone && this.images.get(url) === 'loading') {
          this.images.set(url, 'failed');
          this.generation++;
          this.drawn.redraw();
        }
      },
    );
    return undefined;
  }

  failed(url: string): boolean {
    return this.images.get(url) === 'failed';
  }

  keep(used: ReadonlySet<string>): void {
    for (const url of this.images.keys()) {
      if (!url.startsWith('data:') && !used.has(url)) {
        this.images.delete(url);
      }
    }
  }

  revive(): void {
    this.gone = false;
  }

  dispose(): void {
    this.gone = true;
    this.images.clear();
  }
}

export function useImages(drawn: Redrawn): PaneImages {
  const [cache] = useState(() => new ImageCache(drawn));
  useEffect(() => {
    cache.revive();
    return () => cache.dispose();
  }, [cache]);
  return cache;
}

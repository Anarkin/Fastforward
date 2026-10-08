import { useEffect, useState } from 'react';
import { shownSide, workingTreeSide } from '../shared/comparisons';
import { imageType, imageUrl, vectorType } from '../shared/images';
import {
  workingTreeHash,
  type ChangeArea,
  type FileChange,
} from '../shared/protocol';
import type { DiffFile } from './diff';

export interface ImageOrigin {
  readonly root: string;
  readonly hash: string;
  readonly area?: ChangeArea;
}

export type Side = 'old' | 'new';

const sides: readonly Side[] = ['old', 'new'];

function sidePath(file: DiffFile, side: Side): string {
  return side === 'old' ? (file.oldPath ?? file.path) : file.path;
}

function hasImage(file: DiffFile, side: Side): boolean {
  return (
    file.blobs?.[side] !== undefined &&
    imageType(sidePath(file, side)) !== undefined
  );
}

export function previewsImage(file: DiffFile): boolean {
  return file.binary && sides.some((side) => hasImage(file, side));
}

function isVector(path: string): boolean {
  return imageType(path) === vectorType;
}

export function withUnchangedObjects(
  files: readonly DiffFile[],
  changes: readonly FileChange[],
): readonly DiffFile[] {
  const ids = new Map(
    changes.flatMap((change) =>
      change.id === undefined ? [] : [[change.path, change.id]],
    ),
  );
  if (ids.size === 0) {
    return files;
  }
  return files.map((file) => {
    const id = ids.get(file.path);
    if (file.blobs || id === undefined) {
      return file;
    }
    const raster = imageType(file.path) !== undefined && !isVector(file.path);
    return {
      ...file,
      binary: file.binary || raster,
      blobs: { old: id, new: id },
    };
  });
}

export function rendersImage(file: DiffFile): boolean {
  return (
    !file.binary &&
    file.placeholder === undefined &&
    isVector(file.path) &&
    sides.some((side) => hasImage(file, side))
  );
}

export function diffImageUrl(
  { root, hash, area }: ImageOrigin,
  file: DiffFile,
  side: Side,
): string | undefined {
  const id = file.blobs?.[side];
  if (id === undefined || !hasImage(file, side)) {
    return undefined;
  }
  const disk = area !== 'staged' && side === workingTreeSide(hash);
  return imageUrl({ root, path: sidePath(file, side), id, disk });
}

interface WholeFile {
  readonly path: string;
  readonly content: string;
  readonly binary: boolean;
  readonly id?: string;
}

export function rendersWholeImage(whole: WholeFile): boolean {
  return !whole.binary && isVector(whole.path);
}

export function previewsWholeImage(whole: Omit<WholeFile, 'content'>): boolean {
  return (
    whole.binary &&
    whole.id !== undefined &&
    imageType(whole.path) !== undefined
  );
}

export function wholeImageUrl(
  { root, hash }: ImageOrigin,
  whole: WholeFile,
): string | undefined {
  if (rendersWholeImage(whole)) {
    return `data:${vectorType};charset=utf-8,${encodeURIComponent(whole.content)}`;
  }
  return whole.id === undefined || !previewsWholeImage(whole)
    ? undefined
    : imageUrl({
        root,
        path: whole.path,
        id: whole.id,
        disk: shownSide(hash) === workingTreeHash,
      });
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
    const cached = this.entries.get(url);
    if (cached) {
      this.entries.delete(url);
      this.entries.set(url, cached);
      return cached.loading;
    }
    const entry: Entry = {
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
    return entry.loading;
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

  private evict(kept: string): void {
    for (const [url, entry] of this.entries) {
      if (this.bytes <= this.limit) {
        return;
      }
      if (url !== kept && entry.settled?.kind === 'loaded') {
        this.entries.delete(url);
        this.bytes -= entry.settled.bytes;
        this.urls.revoke(entry.settled.url);
      }
    }
  }
}

const images = new ImageCache();

export function useLoadedImage(
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
    void cache.load(url).then((image) => {
      if (live) {
        setShown({ url, image });
      }
    });
    return () => {
      live = false;
    };
  }, [url, cache]);
  return shown.url === url ? shown.image : undefined;
}

import { useEffect, useState } from 'react';
import { comparedOf, shownSide, workingTreeSide } from '../shared/comparisons';
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
  readonly version?: string;
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
      change.id === undefined || change.link ? [] : [[change.path, change.id]],
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
    file.link === undefined &&
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

export function sideRevision(
  { hash, area }: ImageOrigin,
  side: Side,
): string | undefined {
  const compared = comparedOf(hash);
  if (compared) {
    const at = side === 'old' ? compared.from : compared.to;
    return at === workingTreeHash ? undefined : at;
  }
  if (hash === workingTreeHash) {
    if (side === 'new') {
      return area === 'staged' ? '' : undefined;
    }
    return area === 'unstaged' ? '' : 'HEAD';
  }
  return side === 'old' ? `${hash}^` : hash;
}

export function wholeRevision({ hash }: ImageOrigin): string | undefined {
  const shown = shownSide(hash);
  return shown === workingTreeHash ? undefined : shown;
}

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
    target = decodeURIComponent(slashed.split(/[?#]/)[0] ?? '');
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

export interface DocumentImages {
  readonly root: string;
  readonly document: string;
  readonly revision: string | undefined;
  readonly version: string;
}

const fixedRevision = /^(?:[0-9a-f]{40}|[0-9a-f]{64})\^?$/;

export function documentImageUrl(
  { root, revision, version }: Omit<DocumentImages, 'document'>,
  path: string,
): string {
  const id =
    revision !== undefined && fixedRevision.test(revision) ? revision : version;
  return imageUrl(
    revision === undefined
      ? { root, path, id, disk: true }
      : { root, path, id, disk: false, revision },
  );
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

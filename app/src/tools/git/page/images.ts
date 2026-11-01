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
  return whole.id === undefined || !previewsWholeImage(whole)
    ? undefined
    : imageUrl({
        root,
        path: whole.path,
        id: whole.id,
        disk: shownSide(hash) === workingTreeHash,
      });
}

export interface ViewedSource {
  readonly path: string;
  readonly blob?: string;
}

export function viewedSource(
  { hash, area }: ImageOrigin,
  file: DiffFile,
): ViewedSource | undefined {
  const side: Side = file.blobs?.new === undefined ? 'old' : 'new';
  const path = sidePath(file, side);
  if (area !== 'staged' && side === workingTreeSide(hash)) {
    return { path };
  }
  const blob = file.blobs?.[side];
  return blob === undefined ? undefined : { path, blob };
}

export function wholeViewedSource(
  { hash }: ImageOrigin,
  whole: Omit<WholeFile, 'content'>,
): ViewedSource | undefined {
  if (shownSide(hash) === workingTreeHash) {
    return { path: whole.path };
  }
  return whole.id === undefined
    ? undefined
    : { path: whole.path, blob: whole.id };
}

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

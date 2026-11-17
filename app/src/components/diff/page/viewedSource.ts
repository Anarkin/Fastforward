import { shownSide, workingTreeSide } from '../../../lib/shared/comparisons';
import { workingTreeHash } from '../../../lib/shared/changes';
import type { DiffFile } from './diff';
import type { WholeFile } from './rows';
import { sidePath, type ImageOrigin, type Side } from './images';

export interface ViewedSource {
  readonly path: string;
  readonly blob?: string;
  readonly rev?: string;
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

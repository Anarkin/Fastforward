import type { DiffFile } from './diff';
import { diffImageUrl, type ImageOrigin, type Side } from './images';

export interface Pane {
  readonly side: Side;
  readonly url: string | undefined;
}

export function imagePanes(origin: ImageOrigin, file: DiffFile): Pane[] {
  return (['old', 'new'] as const).map((side) => ({
    side,
    url: diffImageUrl(origin, file, side),
  }));
}

import type { DiffFile } from './diff';
import { diffImageUrl, type ImageOrigin, type Side } from './images';

export interface Pane {
  readonly side: Side;
  readonly url: string | undefined;
}

export function imagePanes(
  origin: ImageOrigin,
  file: DiffFile,
  sideBySide: boolean,
): Pane[] {
  return (['old', 'new'] as const).flatMap((side) => {
    const url = diffImageUrl(origin, file, side);
    return url === undefined && !sideBySide ? [] : [{ side, url }];
  });
}

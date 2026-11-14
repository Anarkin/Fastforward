import type { DiffFile } from './diff';
import { diffImageUrl, type ImageOrigin, type Side } from './images';
import { ImagePane } from '../../../lib/page/images';

interface Pane {
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

export function ImageDiff({ panes }: { panes: readonly Pane[] }) {
  return (
    <div className="image-diff">
      {panes.map(({ side, url }) =>
        url === undefined ? (
          <div key={side} className="image-pane filler">
            <div className="image-frame" />
          </div>
        ) : (
          <ImagePane key={url} url={url} />
        ),
      )}
    </div>
  );
}

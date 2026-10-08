import { useState } from 'react';
import { maxImageSize } from '../shared/images';
import { strings } from '../shared/strings';
import type { DiffFile } from './diff';
import {
  diffImageUrl,
  useLoadedImage,
  type ImageOrigin,
  type Side,
} from './images';

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

const fillerOf = { old: 'addition', new: 'removal' } as const;

export function ImageDiff({ panes }: { panes: readonly Pane[] }) {
  return (
    <div className="image-diff">
      {panes.map(({ side, url }) =>
        url === undefined ? (
          <div key={side} className={`image-pane filler ${fillerOf[side]}`}>
            <div className="image-frame" />
          </div>
        ) : (
          <ImagePane key={url} url={url} />
        ),
      )}
    </div>
  );
}

export function WholeImage({ url }: { url: string }) {
  return (
    <div className="image-diff">
      <ImagePane key={url} url={url} />
    </div>
  );
}

interface Size {
  readonly width: number;
  readonly height: number;
}

function ImagePane({ url }: { url: string }) {
  const image = useLoadedImage(url);
  const [size, setSize] = useState<Size>();
  const [broken, setBroken] = useState(false);
  const note =
    image?.kind === 'tooLarge'
      ? strings.diff.imageTooLarge(maxImageSize / 1024 / 1024)
      : image?.kind === 'failed' || broken
        ? strings.diff.imageFailed
        : undefined;
  return (
    <div className="image-pane">
      {note !== undefined ? (
        <div className="image-note">{note}</div>
      ) : (
        image?.kind === 'loaded' && (
          <div className="image-frame">
            <img
              src={image.url}
              alt=""
              title={
                size &&
                strings.diff.imageDetails(size.width, size.height, image.bytes)
              }
              draggable={false}
              onLoad={(event) =>
                setSize({
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight,
                })
              }
              onError={() => setBroken(true)}
            />
          </div>
        )
      )}
    </div>
  );
}

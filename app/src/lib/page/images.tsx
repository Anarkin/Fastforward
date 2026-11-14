import {
  type CSSProperties,
  useEffect,
  useLayoutEffect,
  useState,
} from 'react';
import { maxImageSize } from '../shared/images';
import { strings } from '../shared/strings';
import {
  type LoadedImage,
  ImageCache,
  type Size,
  realSizeOf,
  usePixelRatio,
  type ImageSizing,
} from './imageSizes';

const images = new ImageCache();

function useLoadedImage(
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

export function WholeImage({ url }: { url: string }) {
  return (
    <div className="image-diff">
      <ImagePane key={url} url={url} />
    </div>
  );
}

function fittedWithin(real: Size): CSSProperties {
  return {
    maxWidth: `min(100%, ${real.width}px)`,
    maxHeight: `min(100%, ${real.height}px)`,
  };
}

export function ImagePane({
  url,
  sizing,
}: {
  url: string;
  sizing?: ImageSizing;
}) {
  const image = useLoadedImage(url);
  const [size, setSize] = useState<Size>();
  const [broken, setBroken] = useState(false);
  const pixelRatio = usePixelRatio();
  const real =
    sizing === undefined || size === undefined || size.width === 0
      ? undefined
      : realSizeOf(size, pixelRatio, sizing.vector);
  const realSize = sizing?.realSize === true;
  const realWidth = realSize ? real?.width : undefined;
  const realHeight = realSize ? real?.height : undefined;
  const onRealSize = sizing?.onRealSize;
  useLayoutEffect(() => {
    if (realWidth !== undefined && realHeight !== undefined) {
      onRealSize?.();
    }
  }, [realWidth, realHeight, onRealSize]);
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
              className={
                !realSize
                  ? undefined
                  : sizing?.vector
                    ? 'real-size'
                    : 'real-size device-pixels'
              }
              style={
                real === undefined
                  ? undefined
                  : realSize
                    ? real
                    : fittedWithin(real)
              }
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

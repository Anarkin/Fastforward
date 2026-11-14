import { useEffect, useRef, useState } from 'react';
import { usePixelRatio } from '../../../lib/page/imageSizes';
import { type Thumbnail, keyOf, thumbnails } from './thumbnailFills';

function useInView(element: React.RefObject<Element | null>): boolean {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const target = element.current;
    if (!target) {
      return undefined;
    }
    const observer = new IntersectionObserver((seen) => {
      setInView(seen.some((each) => each.isIntersecting));
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [element]);
  return inView;
}

function useThumbnail(
  url: string,
  box: number,
  inView: boolean,
): Thumbnail | undefined | null {
  const pixelRatio = usePixelRatio();
  const key = keyOf(url, box, pixelRatio);
  const [shown, setShown] = useState<{
    readonly key: string;
    readonly thumbnail: Thumbnail | null;
  }>();
  useEffect(() => {
    if (!inView) {
      return undefined;
    }
    let live = true;
    const held = thumbnails.hold(url, box, pixelRatio);
    void held.loading.then((thumbnail) => {
      if (live) {
        setShown({ key, thumbnail: thumbnail ?? null });
      }
    });
    return () => {
      live = false;
      held.release();
    };
  }, [url, box, pixelRatio, key, inView]);
  return shown?.key === key
    ? shown.thumbnail
    : thumbnails.peek(url, box, pixelRatio);
}

const handedOver = new WeakSet<Blob>();

function RasterThumbnail({
  url,
  box,
  fallback,
  onMade,
}: {
  url: string;
  box: number;
  fallback: React.ReactNode;
  onMade?: (made: Blob, pixelRatio: number) => void;
}) {
  const slot = useRef<HTMLSpanElement>(null);
  const pixelRatio = usePixelRatio();
  const thumbnail = useThumbnail(url, box, useInView(slot));
  const made = thumbnail?.made;
  useEffect(() => {
    if (made !== undefined && !handedOver.has(made)) {
      handedOver.add(made);
      onMade?.(made, pixelRatio);
    }
  }, [made, onMade, pixelRatio]);
  return (
    <span
      className="thumbnail-slot"
      ref={slot}
      style={{ width: box, height: box }}
    >
      {thumbnail === null
        ? fallback
        : thumbnail && (
            <img
              className="thumbnail-image"
              src={thumbnail.url}
              alt=""
              draggable={false}
              style={{ width: thumbnail.width, height: thumbnail.height }}
            />
          )}
    </span>
  );
}

function VectorThumbnail({
  url,
  box,
  fallback,
}: {
  url: string;
  box: number;
  fallback: React.ReactNode;
}) {
  const [failed, setFailed] = useState<string>();
  if (failed === url) {
    return fallback;
  }
  return (
    <img
      className="thumbnail-image"
      src={url}
      alt=""
      draggable={false}
      style={{ maxWidth: box, maxHeight: box }}
      onError={() => setFailed(url)}
    />
  );
}

export function ThumbnailImage({
  url,
  box,
  vector,
  fallback,
  onMade,
}: {
  url: string;
  box: number;
  vector: boolean;
  fallback: React.ReactNode;
  onMade?: (made: Blob, pixelRatio: number) => void;
}) {
  return vector ? (
    <VectorThumbnail url={url} box={box} fallback={fallback} />
  ) : (
    <RasterThumbnail url={url} box={box} fallback={fallback} onMade={onMade} />
  );
}

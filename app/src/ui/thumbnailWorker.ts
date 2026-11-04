import { boxedThumbnailUrl, madeThumbnailHeader } from '../shared/images';
import { longestSide, targetSide, thumbnailPixels } from './imageSize';
import type {
  FromThumbnailWorker,
  MadeThumbnail,
  ToThumbnailWorker,
} from './thumbnailMessages';

interface WorkerScope {
  postMessage(message: FromThumbnailWorker): void;
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<ToThumbnailWorker>) => void,
  ): void;
}

const scope: WorkerScope = Reflect.get(globalThis, 'self');

async function stored(image: Blob, pixelRatio: number): Promise<MadeThumbnail> {
  const bitmap = await createImageBitmap(image);
  const { width, height } = bitmap;
  bitmap.close();
  return {
    image,
    width: width / pixelRatio,
    height: height / pixelRatio,
    fresh: false,
  };
}

async function made(
  url: string,
  box: number,
  pixelRatio: number,
): Promise<MadeThumbnail | undefined> {
  const response = await fetch(boxedThumbnailUrl(url, box, pixelRatio));
  if (!response.ok) {
    return undefined;
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const image = new Blob([bytes], {
    type: response.headers.get('content-type') ?? '',
  });
  if (response.headers.get(madeThumbnailHeader) !== null) {
    return stored(image, pixelRatio);
  }
  const longest = longestSide(bytes);
  const bitmap =
    longest === undefined
      ? await createImageBitmap(image)
      : await createImageBitmap(image, {
          resizeWidth: targetSide(longest, box, pixelRatio),
          resizeQuality: 'high',
        });
  try {
    const target = targetSide(
      longest ?? Math.max(bitmap.width, bitmap.height),
      box,
      pixelRatio,
    );
    const shown = thumbnailPixels(bitmap, target);
    const canvas = new OffscreenCanvas(shown.width, shown.height);
    const context = canvas.getContext('2d');
    if (context === null) {
      return undefined;
    }
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, shown.width, shown.height);
    return {
      image: await canvas.convertToBlob({ type: 'image/webp' }),
      width: shown.width / pixelRatio,
      height: shown.height / pixelRatio,
      fresh: true,
    };
  } finally {
    bitmap.close();
  }
}

scope.addEventListener('message', ({ data: { id, url, box, pixelRatio } }) => {
  void made(url, box, pixelRatio)
    .catch(() => undefined)
    .then((thumbnail) =>
      scope.postMessage(
        thumbnail === undefined ? { id } : { id, made: thumbnail },
      ),
    );
});

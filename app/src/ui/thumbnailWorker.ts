import { boxedThumbnailUrl, madeThumbnailHeader } from '../shared/images';
import {
  halvings,
  jpegScaling,
  jpegSize,
  longestSide,
  targetSide,
  thumbnailPixels,
  type PixelSize,
} from './imageSize';
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

function drawnOn(
  source: CanvasImageSource,
  size: PixelSize,
  quality: ImageSmoothingQuality,
): OffscreenCanvas {
  const canvas = new OffscreenCanvas(size.width, size.height);
  const context = canvas.getContext('2d');
  if (context === null) {
    throw new Error('no 2d context');
  }
  context.imageSmoothingQuality = quality;
  context.drawImage(source, 0, 0, size.width, size.height);
  return canvas;
}

async function encoded(
  source: CanvasImageSource,
  drawn: PixelSize,
  target: number,
  pixelRatio: number,
): Promise<MadeThumbnail> {
  const shown = thumbnailPixels(drawn, target);
  let current = source;
  for (const step of halvings(drawn, shown)) {
    current = drawnOn(current, step, 'low');
  }
  return {
    image: await drawnOn(current, shown, 'high').convertToBlob({
      type: 'image/webp',
    }),
    width: shown.width / pixelRatio,
    height: shown.height / pixelRatio,
    fresh: true,
  };
}

async function fromJpeg(
  bytes: Uint8Array,
  storedSize: PixelSize,
  box: number,
  pixelRatio: number,
): Promise<MadeThumbnail> {
  const target = targetSide(
    Math.max(storedSize.width, storedSize.height),
    box,
    pixelRatio,
  );
  const scaling = jpegScaling(storedSize, target);
  const decoder = new ImageDecoder({
    data: bytes,
    type: 'image/jpeg',
    ...(scaling && {
      desiredWidth: scaling.width,
      desiredHeight: scaling.height,
    }),
  });
  try {
    const { image } = await decoder.decode();
    try {
      return await encoded(
        image,
        { width: image.displayWidth, height: image.displayHeight },
        target,
        pixelRatio,
      );
    } finally {
      image.close();
    }
  } finally {
    decoder.close();
  }
}

async function fromBitmap(
  image: Blob,
  longest: number | undefined,
  box: number,
  pixelRatio: number,
): Promise<MadeThumbnail> {
  const bitmap =
    longest === undefined
      ? await createImageBitmap(image)
      : await createImageBitmap(image, {
          resizeWidth: targetSide(longest, box, pixelRatio),
          resizeQuality: 'high',
        });
  try {
    return await encoded(
      bitmap,
      bitmap,
      targetSide(
        longest ?? Math.max(bitmap.width, bitmap.height),
        box,
        pixelRatio,
      ),
      pixelRatio,
    );
  } finally {
    bitmap.close();
  }
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
  const jpeg = typeof ImageDecoder === 'function' ? jpegSize(bytes) : undefined;
  const decoded =
    jpeg &&
    (await fromJpeg(bytes, jpeg, box, pixelRatio).catch(() => undefined));
  return decoded ?? fromBitmap(image, longestSide(bytes), box, pixelRatio);
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

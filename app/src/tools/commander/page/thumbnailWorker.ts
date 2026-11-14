import {
  boxedThumbnailUrl,
  filledThumbnailUrl,
  madeThumbnailHeader,
} from '../../../lib/shared/images';
import {
  bitmapResizing,
  halvings,
  jpegScaling,
  jpegSize,
  storedSizeOf,
  targetSide,
  thumbnailPixels,
  type PixelSize,
} from './imageSize';
import type {
  FillOutcome,
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

const headerBytes = 1024 * 1024;

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
  image: Blob,
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
    data: image.stream(),
    type: 'image/jpeg',
    ...(scaling && {
      desiredWidth: scaling.width,
      desiredHeight: scaling.height,
    }),
  });
  try {
    const { image: frame } = await decoder.decode();
    try {
      return await encoded(
        frame,
        { width: frame.displayWidth, height: frame.displayHeight },
        target,
        pixelRatio,
      );
    } finally {
      frame.close();
    }
  } finally {
    decoder.close();
  }
}

async function fromBitmap(
  image: Blob,
  storedSize: PixelSize | undefined,
  box: number,
  pixelRatio: number,
): Promise<MadeThumbnail> {
  const resizing = bitmapResizing(storedSize, box, pixelRatio);
  const bitmap =
    resizing === undefined
      ? await createImageBitmap(image)
      : await createImageBitmap(image, {
          ...resizing,
          resizeQuality: 'high',
        });
  try {
    const decoded = storedSize ?? bitmap;
    return await encoded(
      bitmap,
      bitmap,
      targetSide(Math.max(decoded.width, decoded.height), box, pixelRatio),
      pixelRatio,
    );
  } finally {
    bitmap.close();
  }
}

const fillOutcomes: Readonly<Record<number, FillOutcome>> = {
  204: 'stored',
  409: 'online',
  507: 'full',
};

async function made(
  url: string,
  box: number,
  pixelRatio: number,
  filling: boolean,
): Promise<Omit<FromThumbnailWorker, 'id'>> {
  const boxed = boxedThumbnailUrl(url, box, pixelRatio);
  const response = await fetch(filling ? filledThumbnailUrl(boxed) : boxed);
  const outcome = fillOutcomes[response.status];
  if (outcome !== undefined) {
    return { outcome };
  }
  if (!response.ok) {
    return {};
  }
  const image = await response.blob();
  if (response.headers.get(madeThumbnailHeader) !== null) {
    return { made: await stored(image, pixelRatio) };
  }
  const header = new Uint8Array(
    await image.slice(0, headerBytes).arrayBuffer(),
  );
  const jpeg =
    typeof ImageDecoder === 'function' ? jpegSize(header) : undefined;
  const decoded =
    jpeg &&
    (await fromJpeg(image, jpeg, box, pixelRatio).catch(() => undefined));
  return {
    made:
      decoded ??
      (await fromBitmap(image, storedSizeOf(header), box, pixelRatio)),
  };
}

scope.addEventListener(
  'message',
  ({ data: { id, url, box, pixelRatio, filling } }) => {
    void made(url, box, pixelRatio, filling)
      .catch(() => ({}))
      .then((answer) => scope.postMessage({ id, ...answer }));
  },
);

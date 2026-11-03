const imageTypes: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  svg: 'image/svg+xml',
};

export const vectorType = 'image/svg+xml';

export function imageType(path: string): string | undefined {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? imageTypes[name.slice(dot + 1).toLowerCase()] : undefined;
}

export const maxImageSize = 192 * 1024 * 1024;

export const madeThumbnailHeader = 'x-fastforward-thumbnail';

export const maxThumbnailBytes = 1024 * 1024;

const smallestBox = 16;
const largestBox = 1024;
const largestPixelRatio = 8;

export interface ThumbnailBox {
  readonly box: number;
  readonly pixelRatio: number;
}

export function isThumbnailBox(box: unknown, pixelRatio: unknown): boolean {
  return (
    typeof box === 'number' &&
    Number.isInteger(box) &&
    box >= smallestBox &&
    box <= largestBox &&
    typeof pixelRatio === 'number' &&
    Number.isFinite(pixelRatio) &&
    pixelRatio > 0 &&
    pixelRatio <= largestPixelRatio
  );
}

export function boxedThumbnailUrl(
  url: string,
  box: number,
  pixelRatio: number,
): string {
  return `${url}&${new URLSearchParams({ box: String(box), ratio: String(pixelRatio) })}`;
}

export function thumbnailBoxOf(url: URL): ThumbnailBox | undefined {
  const box = Number(url.searchParams.get('box'));
  const pixelRatio = Number(url.searchParams.get('ratio'));
  return isThumbnailBox(box, pixelRatio) ? { box, pixelRatio } : undefined;
}

export function isWebp(bytes: Uint8Array): boolean {
  const text = (from: number, to: number) =>
    String.fromCharCode(...bytes.subarray(from, to));
  return bytes.length >= 12 && text(0, 4) === 'RIFF' && text(8, 12) === 'WEBP';
}

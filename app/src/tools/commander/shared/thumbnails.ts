import { paneFileOf, type IconSource } from './icons';

export const thumbnailRoute = '/commander-thumbnail';

export function thumbnailUrl(
  { tab, side, folder, name }: IconSource,
  version: string,
): string {
  return `${thumbnailRoute}?${new URLSearchParams({ tab, side, folder, name, version })}`;
}

export function thumbnailSourceOf(url: URL): IconSource | undefined {
  return paneFileOf(url, thumbnailRoute);
}

export const madeThumbnailHeader = 'x-fastforward-thumbnail';

export const maxThumbnailBytes = 1024 * 1024;

const smallestBox = 16;
const largestBox = 1024;
const largestPixelRatio = 8;

export interface ThumbnailBox {
  readonly box: number;
  readonly pixelRatio: number;
}

export function heldBox(box: number): number {
  return Math.min(largestBox, Math.max(smallestBox, Math.round(box)));
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

const fillParameter = 'fill';

export function filledThumbnailUrl(url: string): string {
  return `${url}&${fillParameter}=1`;
}

export function fillsThumbnail(url: URL): boolean {
  return url.searchParams.get(fillParameter) === '1';
}

import { isFullHash } from './hashes';

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

export interface ImageSource {
  readonly root: string;
  readonly path: string;
  readonly id: string;
  readonly disk: boolean;
  readonly revision?: string;
}

const revisionName = /^(?:HEAD|(?:[0-9a-f]{40}|[0-9a-f]{64})\^?)?$/;

export const imageRoute = '/image';

export function imageUrl({
  root,
  path,
  id,
  disk,
  revision,
}: ImageSource): string {
  const query = new URLSearchParams({ root, path, id });
  if (disk) {
    query.set('disk', '1');
  }
  if (revision !== undefined) {
    query.set('revision', revision);
  }
  return `${imageRoute}?${query}`;
}

export function imageSourceOf(url: URL): ImageSource | undefined {
  const query = url.searchParams;
  const root = query.get('root');
  const path = query.get('path');
  const id = query.get('id');
  const disk = query.get('disk') === '1';
  const revision = query.get('revision') ?? undefined;
  if (
    url.pathname !== imageRoute ||
    !root ||
    !path ||
    !id ||
    path.includes('\n')
  ) {
    return undefined;
  }
  if (revision !== undefined) {
    return !disk && revisionName.test(revision)
      ? { root, path, id, disk, revision }
      : undefined;
  }
  return disk || isFullHash(id) ? { root, path, id, disk } : undefined;
}

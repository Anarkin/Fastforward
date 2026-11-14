import { isFullHash } from './hashes';

export {
  imageType,
  maxImageSize,
  vectorType,
} from '../../../lib/shared/images';

export interface ImageSource {
  readonly root: string;
  readonly path: string;
  readonly id: string;
  readonly disk: boolean;
}

export const imageRoute = '/image';

export function imageUrl({ root, path, id, disk }: ImageSource): string {
  const query = new URLSearchParams({ root, path, id });
  if (disk) {
    query.set('disk', '1');
  }
  return `${imageRoute}?${query}`;
}

export function imageSourceOf(url: URL): ImageSource | undefined {
  const query = url.searchParams;
  const root = query.get('root');
  const path = query.get('path');
  const id = query.get('id');
  const disk = query.get('disk') === '1';
  if (
    url.pathname !== imageRoute ||
    !root ||
    !path ||
    !id ||
    path.includes('\n')
  ) {
    return undefined;
  }
  return disk || isFullHash(id) ? { root, path, id, disk } : undefined;
}

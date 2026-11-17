import { isFullHash } from '../../../lib/shared/hashes';

export const indexRev = 'index';

export const headRev = 'HEAD';

export function isFileRev(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  if (value === indexRev || value === headRev) {
    return true;
  }
  return isFullHash(value.endsWith('^') ? value.slice(0, -1) : value);
}

export function revObject(rev: string, path: string): string {
  return rev === indexRev ? `:${path}` : `${rev}:${path}`;
}

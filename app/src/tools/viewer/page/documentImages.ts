import { imageType } from '../../../lib/shared/images';

const scheme = /^[a-z][a-z\d+.-]*:/i;

export function documentImagePath(
  document: string,
  src: string,
): string | undefined {
  const slashed = src.replaceAll('\\', '/');
  if (scheme.test(slashed) || slashed.startsWith('//')) {
    return undefined;
  }
  let target: string;
  try {
    target = decodeURIComponent(slashed.split(/[?#]/)[0] ?? '').replaceAll(
      '\\',
      '/',
    );
  } catch {
    return undefined;
  }
  const parts = target.startsWith('/') ? [] : document.split('/').slice(0, -1);
  for (const part of target.split('/')) {
    if (part === '..') {
      if (parts.length === 0) {
        return undefined;
      }
      parts.pop();
    } else if (part !== '' && part !== '.') {
      parts.push(part);
    }
  }
  const path = parts.join('/');
  return imageType(path) === undefined ? undefined : path;
}

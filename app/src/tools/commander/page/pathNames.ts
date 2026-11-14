import { pathParts } from '../shared/paths';

export function nameOf(path: string): string {
  return pathParts(path).at(-1)?.name ?? '';
}

import type { ChangeArea } from '../shared/protocol';

export function diffSelection(
  root: string | undefined,
  hash: string | undefined,
  path: string | undefined,
  area?: ChangeArea,
): string {
  return JSON.stringify([root, hash, path, area]);
}

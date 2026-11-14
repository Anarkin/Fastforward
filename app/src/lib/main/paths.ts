import * as path from 'node:path';

export function sameRoot(a: string, b: string): boolean {
  return path.relative(a, b) === '';
}

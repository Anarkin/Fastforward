import * as path from 'node:path';

export function parentOf(folder: string): string | undefined {
  const parent = path.dirname(folder);
  return parent === folder ? undefined : parent;
}

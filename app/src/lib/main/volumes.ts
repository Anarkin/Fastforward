import * as path from 'node:path';

function volumeOf(file: string): string {
  const { root } = path.parse(path.resolve(file));
  return process.platform === 'win32' ? root.toLowerCase() : root;
}

export function onSameVolume(file: string, other: string): boolean {
  return volumeOf(file) === volumeOf(other);
}

import type { Stats } from '../../../lib/main/files';

export function stampOf(
  { size, mtimeMs, ctimeMs, ino }: Stats,
  reverse: boolean,
): string {
  return `${size} ${mtimeMs} ${ctimeMs} ${ino}${reverse ? ' reverse' : ''}`;
}

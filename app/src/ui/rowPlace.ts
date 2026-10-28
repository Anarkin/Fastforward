import type { CSSProperties } from 'react';

export function rowPlace(
  start: number,
  height: number | undefined,
): CSSProperties {
  return { height, top: start };
}

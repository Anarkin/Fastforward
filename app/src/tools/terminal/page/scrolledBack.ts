import type { Shown } from '../../../lib/page/scrollProxies';

export function scrolledBack(
  { baseY, viewportY }: { readonly baseY: number; readonly viewportY: number },
  rows: number,
): Shown | undefined {
  return baseY > 0
    ? { at: viewportY / baseY, length: rows / (baseY + rows) }
    : undefined;
}

export function lineAt(
  { baseY }: { readonly baseY: number },
  share: number,
): number {
  return Math.round(share * baseY);
}

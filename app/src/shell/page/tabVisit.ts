import { nearestSlot, slotLefts } from './tabDrag';

export function visitedSlot(
  widths: readonly number[],
  gap: number,
  left: number,
): { readonly index: number; readonly shift: number } {
  const lefts = slotLefts([...widths, 0], gap, widths.length);
  const clamped = Math.min(Math.max(left, 0), lefts.at(-1) ?? 0);
  const index = nearestSlot(lefts, clamped);
  return { index, shift: clamped - (lefts[index] ?? 0) };
}

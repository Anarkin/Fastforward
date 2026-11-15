const minimumShare = 0.15;

export function shareOf(left: number, width: number): number {
  return width <= 0
    ? 0.5
    : Math.min(1 - minimumShare, Math.max(minimumShare, left / width));
}

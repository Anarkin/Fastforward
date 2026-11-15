export const sides = ['left', 'right'] as const;

export type Side = (typeof sides)[number];

export function isSide(value: unknown): value is Side {
  return sides.some((side) => side === value);
}

export function otherSide(side: Side): Side {
  return side === 'left' ? 'right' : 'left';
}

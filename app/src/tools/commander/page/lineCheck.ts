export const checkStart = 4;

export const checkSize = 12;

export const overCheckAttribute = 'data-over-check';

export interface Pointed {
  readonly clientX: number;
  readonly clientY: number;
  readonly currentTarget: Element;
}

export function overCheck({
  clientX,
  clientY,
  currentTarget,
}: Pointed): boolean {
  const row = currentTarget.getBoundingClientRect();
  const across = clientX - row.left - checkStart;
  const down = clientY - row.top - (row.height - checkSize) / 2;
  return across >= 0 && across < checkSize && down >= 0 && down < checkSize;
}

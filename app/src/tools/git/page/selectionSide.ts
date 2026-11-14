export function selectionSide(
  target: Element | null,
): 'left' | 'right' | undefined {
  const side = target?.closest('.split-side');
  if (!side) {
    return undefined;
  }
  return side.parentElement?.firstElementChild === side ? 'left' : 'right';
}

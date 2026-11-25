import { defaultTabSize } from '../shared/tabSize';

export { defaultTabSize };

let pageTabSize: number | undefined;

function themedTabSize(): number {
  if (typeof document === 'undefined') {
    return defaultTabSize;
  }
  const size = Number.parseInt(
    getComputedStyle(document.documentElement).getPropertyValue('--tab-size'),
    10,
  );
  return size > 0 ? size : defaultTabSize;
}

export function tabSizeOf(
  widths: { readonly tabSize?: number } | undefined,
): number {
  return widths?.tabSize ?? (pageTabSize ??= themedTabSize());
}

export function tabStop(column: number, size: number): number {
  const next = column + size - (column % size);
  return next - column < 0.5 ? next + size : next;
}

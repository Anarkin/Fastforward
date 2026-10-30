const sizes = new Intl.NumberFormat('en-US', { useGrouping: true });

export function formatSize(size: number | undefined): string {
  return size === undefined ? '' : sizes.format(size);
}

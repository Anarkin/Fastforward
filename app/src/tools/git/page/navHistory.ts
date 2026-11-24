export function locationsPopupKey(
  searches: number,
  root: string | undefined,
): string {
  return `${searches}\n${root ?? ''}`;
}

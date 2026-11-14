import { comparedOf, comparisonLabel, sideLabel } from '../shared/comparisons';

export function historyButtonClick(
  held: boolean,
  open: boolean,
): 'none' | 'close' | 'step' {
  if (held) {
    return 'none';
  }
  return open ? 'close' : 'step';
}

export function nextHistoryOpen(open: boolean, entries: number): boolean {
  return open && entries > 0;
}

export function locationsPopupKey(
  searches: number,
  root: string | undefined,
): string {
  return `${searches}\n${root ?? ''}`;
}

export function historyLabel(hash: string): string {
  const compared = comparedOf(hash);
  return compared ? comparisonLabel(compared) : sideLabel(hash);
}

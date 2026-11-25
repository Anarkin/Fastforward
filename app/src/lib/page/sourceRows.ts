import type { ContextMenuItem } from './contextMenuItem';
import { plainOf, type Sentence } from '../shared/sentences';

export interface Row {
  readonly sentence: Sentence;
  readonly set: boolean;
  readonly onClick?: () => void;
}

export const unset = (sentence: Sentence): Row => ({ sentence, set: false });

export const set = (sentence: Sentence, onClick?: () => void): Row => ({
  sentence,
  set: true,
  ...(onClick !== undefined && { onClick }),
});

export function sourceItems(
  heading: string,
  rows: readonly Row[],
): ContextMenuItem[] {
  const applied = rows.findIndex((row) => row.set);
  return [
    { label: heading, disabled: true },
    ...rows.map((row, index): ContextMenuItem => ({
      label: plainOf(row.sentence),
      sentence: row.sentence,
      keywords: heading,
      checked: index === applied,
      indented: true,
      ...(row.set
        ? row.onClick !== undefined && { onClick: row.onClick }
        : { disabled: true, struck: true }),
    })),
  ];
}

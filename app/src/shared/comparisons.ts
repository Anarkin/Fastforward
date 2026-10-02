import { shortHash } from './hashes';
import { workingTreeHash } from './protocol';

export interface Comparison {
  readonly from: string;
  readonly to: string;
}

const separator = '..';

export function comparisonOf(from: string, to: string): string {
  return `${from}${separator}${to}`;
}

export function comparedOf(
  selection: string | undefined,
): Comparison | undefined {
  const at = selection?.indexOf(separator) ?? -1;
  return selection === undefined || at === -1
    ? undefined
    : {
        from: selection.slice(0, at),
        to: selection.slice(at + separator.length),
      };
}

export function sidesOf(selection: string | undefined): readonly string[] {
  if (selection === undefined) {
    return [];
  }
  const compared = comparedOf(selection);
  return compared ? [compared.from, compared.to] : [selection];
}

export function compareWith(
  selection: string | undefined,
  added: string,
): string {
  const compared = comparedOf(selection);
  if (!compared) {
    return selection === undefined || selection === added
      ? added
      : comparisonOf(selection, added);
  }
  if (added === compared.from) {
    return compared.to;
  }
  return added === compared.to
    ? compared.from
    : comparisonOf(compared.from, added);
}

function sideLabel(side: string): string {
  return side === workingTreeHash ? 'uncommitted' : shortHash(side);
}

export function comparisonLabel({ from, to }: Comparison): string {
  return `${sideLabel(from)} → ${sideLabel(to)}`;
}

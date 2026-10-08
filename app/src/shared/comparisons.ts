import { shortHash } from './hashes';
import { workingTreeHash } from './protocol';
import { strings } from './strings';

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

export function shownSide<T extends string | undefined>(
  selection: T,
): string | T {
  return comparedOf(selection)?.to ?? selection;
}

export function workingTreeSide(hash: string): 'old' | 'new' | undefined {
  const { from, to } = comparedOf(hash) ?? { from: undefined, to: hash };
  if (to === workingTreeHash) {
    return 'new';
  }
  return from === workingTreeHash ? 'old' : undefined;
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

export function sideLabel(side: string): string {
  return side === workingTreeHash
    ? strings.commits.uncommittedSide
    : shortHash(side);
}

export function comparisonLabel({ from, to }: Comparison): string {
  return strings.common.fromTo(sideLabel(from), sideLabel(to));
}

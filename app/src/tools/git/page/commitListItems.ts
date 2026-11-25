import { comparedOf, sidesOf } from '../../../lib/shared/comparisons';
import { type RefInfo } from '../shared/protocol';
import { clicked, type Click } from '../../../lib/shared/keymap';
import { gitKeymap } from './keymap';

export const noRefs: readonly RefInfo[] = [];

export function isCompareClick(event: Click): boolean {
  return clicked(gitKeymap.compare, event) !== undefined;
}

export function selectionClasses(hash: string, selection: string | undefined) {
  if (!sidesOf(selection).includes(hash)) {
    return [];
  }
  return comparedOf(selection)?.from === hash
    ? ['selected', 'compare-from']
    : ['selected'];
}

export function commitClass(
  hash: string,
  selected: string | undefined,
  headCommit: string | undefined,
): string {
  return [
    'commit',
    ...selectionClasses(hash, selected),
    ...(hash === headCommit ? ['checked-out'] : []),
  ].join(' ');
}

import { type VirtualItem } from '@tanstack/react-virtual';
import { comparedOf, shownSide, sidesOf } from '../shared/comparisons';
import { type RefInfo } from '../shared/protocol';
import { clicked, type Click } from '../../../lib/shared/keymap';
import { gitKeymap } from './keymap';
import { strings } from '../../../lib/shared/strings';
import { activeDescendant, rowId } from '../../../lib/page/rowIds';

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

export function commitOption(
  list: string,
  key: VirtualItem['key'],
  index: number,
  count: number,
  selection: string | undefined,
) {
  return {
    id: rowId(list, key),
    role: 'option',
    'aria-selected':
      typeof key === 'string' && sidesOf(selection).includes(key),
    'aria-setsize': count,
    'aria-posinset': index + 1,
  };
}

export function commitListbox(
  list: string,
  drawn: readonly { readonly key: VirtualItem['key'] }[],
  selection: string | undefined,
) {
  return {
    role: 'listbox',
    'aria-label': strings.commits.list,
    'aria-multiselectable': comparedOf(selection) !== undefined,
    'aria-activedescendant': activeDescendant(
      list,
      shownSide(selection),
      drawn,
    ),
  };
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

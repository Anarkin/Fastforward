import { commitPageSize } from '../../../../../tools/git/shared/protocol';
import { newTabState } from '../../../../../tools/git/main/tabState';
import { loadHistory } from '../../../../../tools/git/main/tabHistory';
import { layOutHistory } from '../../../../../tools/git/main/tabLayout';
import { Commits } from '../../../../../tools/git/main/commits';
import { commitInfo } from '../../../../helpers/gitValues';

export const at = (commit: string) => ({
  kind: 'branch' as const,
  name: commit,
  commit,
});

export const page = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => commitInfo(`c${from + i}`));

export const history = [
  { hash: 'c', parents: ['a', 'b'] },
  { hash: 'b', parents: ['a'] },
  { hash: 'a', parents: [] },
];
export const long = Array.from({ length: 3 * commitPageSize }, (_, i) => ({
  hash: `h${i}`,
  parents: i < 3 * commitPageSize - 1 ? [`h${i + 1}`] : [],
}));

export function laidOut(entries = long) {
  const tab = newTabState();
  loadHistory(tab, Commits.of(entries), undefined, []);
  layOutHistory(tab, false, undefined);
  return tab;
}

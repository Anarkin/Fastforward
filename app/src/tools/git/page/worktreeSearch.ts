import type { GitToWebviewOf } from '../shared/protocol';
import type { GitSource } from './gitState';
import { withEntry, withKey } from '../../../lib/page/tabKeyed';

export const searchFocusName = 'commit-search';

export function worktreeSwitched(
  from: string | undefined,
  { worktree, worktrees }: GitToWebviewOf<'worktrees'>,
): boolean {
  return (
    from !== undefined &&
    worktree !== undefined &&
    worktree !== from &&
    worktrees?.some((listed) => listed.root === from) === true
  );
}

export function withSearchCarried<T extends GitSource>(
  state: T,
  from: string,
  to: string,
): T {
  return {
    ...state,
    searching: withKey(state.searching, to, state.searching.has(from)),
    searches: withEntry(state.searches, to, state.searches.get(from)),
  };
}

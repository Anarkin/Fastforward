import type { BookmarkRef, Tracking } from '../shared/protocol';
import { useGit } from './store';

export interface BranchActionsOf {
  readonly pulling: boolean;
  readonly pushing: boolean;
  readonly onPull: () => void;
  readonly onPush: () => void;
  readonly tracking?: Tracking;
}

export function useCheckedOut(ref: BookmarkRef): boolean {
  const head = useGit((state) => state.tab.repository?.head);
  return ref.kind === 'branch' && ref.name === head;
}

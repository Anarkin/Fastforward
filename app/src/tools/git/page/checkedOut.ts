import type { BookmarkRef } from '../shared/protocol';
import { useGit } from './store';

export function useCheckedOut(ref: BookmarkRef): boolean {
  const head = useGit((state) => state.tab.repository?.head);
  return ref.kind === 'branch' && ref.name === head;
}

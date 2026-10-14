import type { FileChange } from '../shared/protocol';
import { strings } from '../shared/strings';

export type ChangeKind = 'added' | 'modified' | 'deleted' | 'renamed';

const kinds: Record<FileChange['status'], ChangeKind> = {
  A: 'added',
  U: 'added',
  C: 'added',
  M: 'modified',
  T: 'modified',
  '?': 'modified',
  D: 'deleted',
  R: 'renamed',
};

export function changeKind(change: FileChange): ChangeKind {
  return kinds[change.status];
}

export function changeClass(change: FileChange | undefined): string {
  return change === undefined
    ? 'path unchanged'
    : change.status === 'D'
      ? 'path deleted'
      : 'path';
}

export function changeTitle(change: FileChange): string {
  const path = change.oldPath
    ? strings.common.fromTo(change.oldPath, change.path)
    : change.path;
  return strings.files.change(strings.files.statuses[change.status], path);
}

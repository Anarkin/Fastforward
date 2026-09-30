import type { FileChange } from '../shared/protocol';

const statusNames: Record<FileChange['status'], string> = {
  A: 'Added',
  M: 'Modified',
  D: 'Deleted',
  R: 'Renamed',
  C: 'Copied',
  T: 'Type changed',
  U: 'Untracked',
  '?': 'Changed',
};

export function changeClass(change: FileChange | undefined): string {
  return change === undefined
    ? 'path unchanged'
    : change.status === 'D'
      ? 'path deleted'
      : 'path';
}

export function changeTitle(change: FileChange): string {
  const path = change.oldPath
    ? `${change.oldPath} → ${change.path}`
    : change.path;
  return `${statusNames[change.status]}: ${path}`;
}

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

export function renamedPath(from: string, to: string): string {
  let start = 0;
  for (let i = 0; i < from.length && from[i] === to[i]; i++) {
    if (from[i] === '/') {
      start = i + 1;
    }
  }
  const floor = start > 0 ? start - 1 : 0;
  let end = 0;
  for (
    let a = from.length - 1, b = to.length - 1;
    a >= floor && b >= floor && from[a] === to[b];
    a--, b--
  ) {
    if (from[a] === '/') {
      end = from.length - a;
    }
  }
  if (start + end === 0) {
    return strings.common.fromTo(from, to);
  }
  const middle = (path: string) =>
    path.slice(start, start + Math.max(0, path.length - start - end));
  return strings.common.fromToWithin(
    from.slice(0, start),
    middle(from),
    middle(to),
    from.slice(from.length - end),
  );
}

export function changeTitle(change: FileChange): string {
  const path = change.oldPath
    ? strings.common.fromTo(change.oldPath, change.path)
    : change.path;
  const statuses = change.link
    ? strings.files.linkStatuses
    : strings.files.statuses;
  return strings.files.change(statuses[change.status], path);
}

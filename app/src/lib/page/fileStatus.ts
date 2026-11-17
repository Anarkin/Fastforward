import type { FileChange } from '../shared/changes';
import { strings } from '../shared/strings';
import { sentence, type Sentence, type Value } from '../shared/sentences';
import type { ChangeKind } from './iconKinds';
import { wholePath } from './pathLooks';

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

const piece = (
  name: string,
  kind: 'file' | 'folder',
  root: string | undefined,
): Sentence | Value =>
  name === '' ? '' : { name, path: kind, ...(root !== undefined && { root }) };

const within = (root: string | undefined, folder: string) =>
  folder === '' ? root : wholePath(root, folder);

export function renamedPath(from: string, to: string, root?: string): Sentence {
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
    return strings.common.renamed(
      piece(from, 'file', root),
      piece(to, 'file', root),
    );
  }
  const middle = (path: string) =>
    path.slice(start, start + Math.max(0, path.length - start - end));
  const shared = from.slice(0, start);
  const kept = from.slice(from.length - end);
  const changed = kept === '' ? 'file' : 'folder';
  return strings.common.renamedWithin(
    piece(shared, 'folder', root),
    piece(middle(from), changed, within(root, shared)),
    piece(middle(to), changed, within(root, shared)),
    kept === ''
      ? ''
      : sentence`${kept.slice(0, 1)}${piece(kept.slice(1), 'file', within(root, shared + middle(to)))}`,
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

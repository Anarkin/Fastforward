import type { FileChange } from '../shared/changes';
import { strings } from '../shared/strings';
import {
  namedFile,
  sentence,
  type Sentence,
  type Value,
} from '../shared/sentences';
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

const letters: Record<FileChange['status'], string> = {
  A: 'A',
  U: 'N',
  C: 'C',
  M: 'M',
  T: 'T',
  '?': '?',
  D: 'D',
  R: 'R',
};

const conflictLetter = '!';

const linkLetter = '@';

export function changeKind(change: FileChange): ChangeKind {
  return change.conflict === true ? 'conflict' : kinds[change.status];
}

export function changeMark(change: FileChange | undefined): string {
  if (change === undefined) {
    return '  ';
  }
  const letter =
    change.conflict === true ? conflictLetter : letters[change.status];
  return `${letter}${change.link === true ? linkLetter : ' '}`;
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

const isSeparator = (character: string | undefined) =>
  character === '/' || character === '\\';

export function renamedPath(from: string, to: string, root?: string): Sentence {
  let start = 0;
  for (let i = 0; i < from.length && from[i] === to[i]; i++) {
    if (isSeparator(from[i])) {
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
    if (isSeparator(from[a])) {
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

export function changeTitle(change: FileChange, root?: string): Sentence {
  return change.oldPath
    ? strings.common.fileFromTo(change.oldPath, change.path, root)
    : [namedFile(change.path, root)];
}

export function changeMeaning(change: FileChange): Sentence {
  const link = change.link === true;
  const status =
    change.conflict === true
      ? link
        ? strings.files.linkConflict
        : strings.files.conflict
      : (link ? strings.files.linkStatuses : strings.files.statuses)[
          change.status
        ];
  return sentence`${status}`;
}

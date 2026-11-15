import type { Sentence } from '../../../lib/shared/sentences';
import { workingTreeHash } from '../shared/protocol';

export function shownSelection(
  selected: string | undefined,
  workingTree: number | undefined,
): string | undefined {
  return selected === workingTreeHash && !workingTree ? undefined : selected;
}

export function columnsClass(
  commitsShown: boolean,
  selected: string | undefined,
  diffShown = true,
): string {
  return [
    'columns',
    ...(commitsShown ? [] : ['commits-hidden']),
    ...(selected === undefined ? ['nothing-selected'] : []),
    ...(diffShown ? [] : ['no-changes']),
  ].join(' ');
}

export function showsDiff(
  error: Sentence | undefined,
  listsNothing: boolean,
): boolean {
  return error !== undefined || !listsNothing;
}

export function listError(
  error: Sentence | undefined,
  selected: string | undefined,
): Sentence | undefined {
  return selected === undefined ? error : undefined;
}

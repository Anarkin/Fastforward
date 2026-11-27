import type { EditorState } from '@codemirror/state';
import {
  longestCopy,
  standsAlone,
  wordAround,
} from '../../../lib/shared/textMatches';

export interface WordPlace {
  readonly from: number;
  readonly to: number;
}

export function wordAt(state: EditorState, at: number): WordPlace | undefined {
  const line = state.doc.lineAt(at);
  const from = Math.max(line.from, at - longestCopy);
  const to = Math.min(line.to, at + longestCopy);
  const word = wordAround(state.sliceDoc(from, to), at - from);
  if (word === undefined) {
    return undefined;
  }
  const start = from + word.start;
  const end = from + word.end;
  const before = Math.max(line.from, start - 2);
  const after = Math.min(line.to, end + 2);
  return standsAlone(
    state.sliceDoc(before, after),
    start - before,
    end - before,
  )
    ? { from: start, to: end }
    : undefined;
}

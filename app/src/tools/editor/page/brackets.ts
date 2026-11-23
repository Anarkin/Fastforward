import { matchBrackets, type MatchResult } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';

export interface BracketPlace {
  readonly from: number;
  readonly to: number;
}

export function matchedPair(match: MatchResult | null | false): BracketPlace[] {
  return match && match.matched && match.end !== undefined
    ? [
        { from: match.start.from, to: match.start.to },
        { from: match.end.from, to: match.end.to },
      ]
    : [];
}

const besideCursor = (state: EditorState, head: number) =>
  matchBrackets(state, head, -1) ||
  (head > 0 && matchBrackets(state, head - 1, 1)) ||
  matchBrackets(state, head, 1) ||
  (head < state.doc.length && matchBrackets(state, head + 1, -1));

const pairs = new WeakMap<EditorState, readonly BracketPlace[]>();

export function bracketPairs(state: EditorState): readonly BracketPlace[] {
  let found = pairs.get(state);
  if (found === undefined) {
    found = state.selection.ranges
      .flatMap((range) =>
        range.empty ? matchedPair(besideCursor(state, range.head)) : [],
      )
      .toSorted((one, other) => one.from - other.from);
    pairs.set(state, found);
  }
  return found;
}

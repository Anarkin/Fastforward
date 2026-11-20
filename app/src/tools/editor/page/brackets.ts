import { bracketMatching, type MatchResult } from '@codemirror/language';
import type { Extension, Range } from '@codemirror/state';
import { Decoration } from '@codemirror/view';

const matching = Decoration.mark({ class: 'cm-matchingBracket' });

export function matchedPair(match: MatchResult): Range<Decoration>[] {
  return match.matched && match.end !== undefined
    ? [
        matching.range(match.start.from, match.start.to),
        matching.range(match.end.from, match.end.to),
      ]
    : [];
}

export const bracketPairs: Extension = bracketMatching({
  renderMatch: matchedPair,
});

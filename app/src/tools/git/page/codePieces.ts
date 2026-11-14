import { wholeClusters } from '../../../lib/page/textWidths';
import type { FindRange } from './find';
import type { SyntaxRange } from './syntax';

interface CodePiece {
  readonly start: number;
  readonly end: number;
  readonly find: 'match' | 'current' | undefined;
  readonly token: SyntaxRange['kind'] | undefined;
  readonly word: boolean;
  readonly gapBefore: boolean;
}

export interface CodePieces {
  readonly pieces: readonly CodePiece[] | undefined;
  readonly gapAfter: boolean;
}

function covering<T extends FindRange>(
  ranges: readonly T[],
): (start: number, end: number) => T | undefined {
  let next = 0;
  return (start, end) => {
    while (next < ranges.length && ranges[next].end <= start) {
      next++;
    }
    const range = ranges.at(next);
    return range && range.start <= start && end <= range.end
      ? range
      : undefined;
  };
}

export function codePieces(
  text: string,
  syntax: readonly SyntaxRange[],
  words: readonly FindRange[],
  found: readonly FindRange[],
  foundNow: FindRange | undefined,
): CodePieces {
  if (words.length === 0 && syntax.length === 0 && found.length === 0) {
    return { pieces: undefined, gapAfter: false };
  }
  const finds = wholeClusters(text, found);
  const [current] =
    foundNow === undefined ? [] : wholeClusters(text, [foundNow]);
  const edges = [
    ...new Set([
      0,
      text.length,
      ...[...syntax, ...words, ...finds].flatMap((range) => [
        range.start,
        range.end,
      ]),
    ]),
  ].toSorted((a, b) => a - b);
  const findAt = covering(finds);
  const tokenAt = covering(syntax);
  const wordAt = covering(words);
  const gaps = new Set(
    words.flatMap((word) => (word.start === word.end ? [word.start] : [])),
  );
  const pieces = edges.slice(0, -1).map((start, index) => {
    const end = edges[index + 1];
    const find = findAt(start, end);
    const isCurrent =
      find !== undefined &&
      current?.start === find.start &&
      current.end === find.end;
    return {
      start,
      end,
      find:
        find === undefined
          ? undefined
          : isCurrent
            ? ('current' as const)
            : ('match' as const),
      token: tokenAt(start, end)?.kind,
      word: wordAt(start, end) !== undefined,
      gapBefore: gaps.has(start),
    };
  });
  return { pieces, gapAfter: gaps.has(text.length) };
}

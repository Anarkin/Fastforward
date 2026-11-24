import { matchesIn, maxMatches } from '../../../lib/shared/textMatches';
import type { SearchOptions } from '../../../lib/shared/searchOptions';

interface CellLike {
  getChars(): string;
  getWidth(): number;
}

interface LineLike {
  readonly isWrapped: boolean;
  readonly length: number;
  getCell(x: number): CellLike | undefined;
}

export interface BufferLike {
  readonly length: number;
  getLine(y: number): LineLike | undefined;
}

interface MatchPiece {
  readonly row: number;
  readonly column: number;
  readonly width: number;
}

export type ScreenMatch = readonly MatchPiece[];

interface Place {
  readonly row: number;
  readonly column: number;
  readonly width: number;
}

function filledLength(line: LineLike): number {
  for (let x = line.length - 1; x >= 0; x--) {
    if ((line.getCell(x)?.getChars() ?? '') !== '') {
      return x + 1;
    }
  }
  return 0;
}

function piecesOf(places: readonly Place[]): ScreenMatch {
  const pieces: MatchPiece[] = [];
  for (const place of places) {
    const last = pieces.at(-1);
    if (last?.row === place.row) {
      const end = Math.max(
        last.column + last.width,
        place.column + place.width,
      );
      pieces[pieces.length - 1] = { ...last, width: end - last.column };
    } else {
      pieces.push({ ...place });
    }
  }
  return pieces;
}

export function screenMatches(
  buffer: BufferLike,
  query: string,
  options: SearchOptions,
  limit = maxMatches,
): ScreenMatch[] {
  const found: ScreenMatch[] = [];
  if (query === '') {
    return found;
  }
  let text = '';
  let places: Place[] = [];
  const flush = () => {
    for (const { start, end } of matchesIn(
      text,
      query,
      options,
      limit - found.length,
    )) {
      found.push(piecesOf(places.slice(start, end)));
    }
    text = '';
    places = [];
  };
  for (let row = 0; row < buffer.length && found.length < limit; row++) {
    const line = buffer.getLine(row);
    if (line === undefined) {
      continue;
    }
    if (!line.isWrapped) {
      flush();
    }
    const wrapsOn = buffer.getLine(row + 1)?.isWrapped === true;
    const length = wrapsOn ? line.length : filledLength(line);
    for (let column = 0; column < length; column++) {
      const cell = line.getCell(column);
      const width = cell?.getWidth() ?? 1;
      if (width === 0) {
        continue;
      }
      const chars = cell?.getChars() || ' ';
      text += chars;
      for (let unit = 0; unit < chars.length; unit++) {
        places.push({ row, column, width });
      }
    }
  }
  if (found.length < limit) {
    flush();
  }
  return found.slice(0, limit);
}

export function firstFrom(
  matches: readonly ScreenMatch[],
  row: number,
  column: number,
): number {
  const at = matches.findIndex((match) => {
    const first = match[0];
    return (
      first !== undefined &&
      (first.row > row || (first.row === row && first.column >= column))
    );
  });
  return at === -1 ? 0 : at;
}

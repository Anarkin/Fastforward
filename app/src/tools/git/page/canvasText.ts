import type { FindRange } from '../../../lib/shared/textMatches';

export interface Piece {
  readonly text: string;
  readonly start: number;
  readonly marked: boolean;
}

export function piecesOf(
  run: string,
  marks: readonly FindRange[],
  shownLength: number,
): Piece[] {
  const pieces: Piece[] = [];
  let at = 0;
  for (const mark of marks) {
    const start = Math.max(mark.start, at);
    const end = Math.min(mark.end, shownLength);
    if (end <= start) {
      continue;
    }
    if (start > at) {
      pieces.push({ text: run.slice(at, start), start: at, marked: false });
    }
    pieces.push({ text: run.slice(start, end), start, marked: true });
    at = end;
  }
  if (at < run.length) {
    pieces.push({ text: run.slice(at), start: at, marked: false });
  }
  return pieces;
}

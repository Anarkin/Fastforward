import type { RunAtlas } from '../../../components/cells/page/runAtlas';
import type { FindRange } from '../../../lib/shared/textMatches';

export const ellipsis = '…';

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

export function fitted(
  atlas: RunAtlas,
  text: string,
  font: string,
  room: number,
): string {
  if (atlas.measure(text, font) <= room) {
    return text;
  }
  const characters = Array.from(text);
  let low = 0;
  let high = characters.length;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    const cut = characters.slice(0, middle).join('') + ellipsis;
    if (atlas.measure(cut, font) <= room) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return low === 0 ? '' : characters.slice(0, low).join('') + ellipsis;
}

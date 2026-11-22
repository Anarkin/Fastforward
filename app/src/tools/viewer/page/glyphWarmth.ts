import { nonAscii } from '../../../lib/page/graphemes';
import {
  prepareRow,
  type CellPainting,
  type RowPart,
  type RowsLook,
} from './cellPainting';
import { notDrawn, type GlyphStyle, type GlyphTiles } from './glyphTiles';
import type { IdleJob } from './idleWork';
import type { ScreenRow } from './screenRows';
import { drawPieces } from './textCells';
import { rowSegments } from './textColors';

const firstPrintable = 33;

const lastPrintable = 126;

const mostFilled = 0.5;

const linesAStep = 2000;

const newline = '\n';

export function asciiJob(
  tiles: GlyphTiles,
  styles: readonly GlyphStyle[],
): IdleJob {
  const { generation } = tiles;
  let style = 0;
  let code = firstPrintable;
  return () => {
    while (style < styles.length && tiles.generation === generation) {
      const known = styles[style].ascii[code] >= 0;
      if (!known && tiles.ascii(styles[style], code) === notDrawn) {
        return tiles.full;
      }
      code++;
      if (code > lastPrintable) {
        code = firstPrintable;
        style++;
      }
      if (!known) {
        return false;
      }
    }
    return true;
  };
}

export interface RowAhead {
  readonly row: ScreenRow;
  readonly part: RowPart | undefined;
}

export function rowsJob(
  painting: CellPainting,
  look: RowsLook,
  rows: readonly RowAhead[],
): IdleJob {
  let at = 0;
  return () => {
    const { tiles } = painting;
    const ahead = rows[at];
    if (ahead === undefined || tiles.filled > mostFilled) {
      return true;
    }
    if (prepareRow(painting, look, ahead.row, ahead.part) || tiles.full) {
      at++;
    }
    return at >= rows.length;
  };
}

export function linesJob(
  painting: CellPainting,
  look: RowsLook,
  text: string,
): IdleJob {
  const { tiles, scratch } = painting;
  const { generation } = tiles;
  const { colored } = look;
  let line = 0;
  let from = 0;
  const next = (): string | undefined => {
    if (colored !== undefined) {
      return colored.lines[line];
    }
    if (from > text.length) {
      return undefined;
    }
    const end = text.indexOf(newline, from);
    const found = text.slice(from, end === -1 ? text.length : end);
    from = (end === -1 ? text.length : end) + 1;
    return found;
  };
  const drawn = (found: string): boolean => {
    const start = colored?.lineStarts[line] ?? 0;
    const row = { start, end: start, text: found };
    scratch.reset();
    drawPieces(
      {
        tiles,
        frame: scratch,
        palette: painting.palette,
        widths: look.widths,
        blanks: look.showWhitespace,
        first: 0,
        limit: Infinity,
        dot: painting.dot,
      },
      (colored && rowSegments(colored, row)) ?? [{ text: found }],
      0,
      0,
    );
    return scratch.missing === 0;
  };
  let waiting: string | undefined;
  return () => {
    if (tiles.generation !== generation || tiles.filled > mostFilled) {
      return true;
    }
    for (let step = 0; step < linesAStep; step++) {
      const found = waiting ?? next();
      if (found === undefined) {
        return true;
      }
      if (nonAscii.test(found)) {
        if (!drawn(found) && !tiles.full) {
          waiting = found;
          return false;
        }
        waiting = undefined;
        line++;
        return false;
      }
      waiting = undefined;
      line++;
    }
    return false;
  };
}

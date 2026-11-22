import type { ScreenRow } from './lines';
import {
  prepareRow,
  type CellPainting,
  type RowPart,
  type RowsLook,
} from './cellPainting';
import { notDrawn, type GlyphStyle, type GlyphTiles } from './glyphTiles';
import type { IdleJob } from './idleWork';

const firstPrintable = 33;

const lastPrintable = 126;

const mostFilled = 0.5;

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

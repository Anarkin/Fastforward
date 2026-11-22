import type {
  CellPainting,
  RowsLook,
} from '../../../components/cells/page/cellPainting';
import type { IdleJob } from '../../../components/cells/page/idleWork';
import { drawPieces } from '../../../components/cells/page/textCells';
import { nonAscii } from '../../../lib/page/graphemes';
import { rowSegments, type ColoredText } from './textColors';

const mostFilled = 0.5;

const linesAStep = 2000;

const newline = '\n';

export function linesJob(
  painting: CellPainting,
  look: Pick<RowsLook, 'widths' | 'showWhitespace'>,
  text: string,
  colored: ColoredText | undefined,
): IdleJob {
  const { tiles, scratch } = painting;
  const { generation } = tiles;
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
        left: 0,
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

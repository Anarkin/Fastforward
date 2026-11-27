import {
  drawScreenRow,
  type RowPart,
  type RowsLook,
} from '../../../components/cells/page/cellPainting';
import type { ScreenRow } from '../../../components/cells/page/lines';
import type { FindMark } from '../../../components/cells/page/marks';
import type { TextDrawing } from '../../../components/cells/page/textCells';
import { charAt, columnIn } from '../../../components/cells/page/textPlaces';
import type { TextWidths } from '../../../lib/page/textWidths';
import type { Screen, TextBlock } from './screen';

const noMarks: readonly FindMark[] = [];

function ownedParts(
  screen: Screen,
  block: TextBlock,
  row: ScreenRow,
  down: number,
  widths: TextWidths,
): RowPart[] {
  const { text } = row.row;
  const first = block.first ?? 0;
  const parts: RowPart[] = [];
  let start: number | undefined;
  const owned = (column: number) => {
    const across = block.column + column - screen.column;
    return (
      across < 0 ||
      across >= screen.columns ||
      screen.owners[down * screen.columns + across] === block.owner
    );
  };
  const flush = (end: number) => {
    if (start === undefined) {
      return;
    }
    const from =
      start + first <= row.indent
        ? row.from
        : charAt(widths, text, row, start + first);
    const to = charAt(widths, text, row, end + first);
    if (to > from || (parts.length === 0 && from === row.from)) {
      parts.push({ from, to, column: columnIn(widths, text, row, from) });
    }
    start = undefined;
  };
  for (let column = 0; column < block.room; column++) {
    if (owned(column)) {
      start ??= column;
    } else {
      flush(column);
    }
  }
  flush(block.room);
  return parts;
}

const chosenAt = (
  screen: Screen,
  block: TextBlock,
  part: RowPart,
  down: number,
): boolean => {
  const across = Math.min(
    screen.columns - 1,
    Math.max(
      0,
      block.column + part.column - (block.first ?? 0) - screen.column,
    ),
  );
  return screen.chosen[down * screen.columns + across] === 1;
};

export function drawTexts(
  screen: Screen,
  base: TextDrawing,
  chosenBase: TextDrawing,
  rowHeight: number,
  above: number,
): void {
  const { advance } = base.tiles.metrics;
  for (const block of screen.texts) {
    const left = Math.round(
      base.left + (block.column - screen.column) * advance,
    );
    const first = block.first ?? 0;
    const placed = { first, left, limit: block.wrapAt ?? Infinity };
    const drawing: TextDrawing = { ...base, ...placed };
    const chosenDrawing: TextDrawing = { ...chosenBase, ...placed };
    const { kind } = block;
    const look: RowsLook = {
      wrapAt: block.wrapAt,
      segmentsOf:
        block.segmentsOf ??
        (kind === undefined
          ? undefined
          : (line) => [{ text: line.text, kind }]),
      marksOf: () => noMarks,
      showWhitespace: base.blanks,
      widths: base.widths,
      first,
      selection: block.selection,
      left,
    };
    for (const [index, row] of block.rows.entries()) {
      const down = block.row + index - screen.row;
      if (down < 0 || down >= screen.rows) {
        continue;
      }
      for (const part of ownedParts(screen, block, row, down, base.widths)) {
        drawScreenRow(
          chosenAt(screen, block, part, down) ? chosenDrawing : drawing,
          look,
          row,
          part,
          down * rowHeight - above,
        );
      }
    }
  }
}

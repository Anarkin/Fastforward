import { memo } from 'react';
import { blankRuns, spaceColumnsAt } from '../../../lib/page/rowBreaks';
import { columnsOf } from '../../../lib/page/textColumns';
import { DotRowsShown } from '../../../lib/page/dotRowsShown';
import type { DotLook } from '../../../lib/page/dotLook';
import { strings } from '../../../lib/shared/strings';
import type { TextWidths } from '../../../lib/page/textWidths';
import { MarkedText } from './findMarks';
import type { FindMark } from './markPieces';
import { marksWithin, piecesWithin, type ScreenRow } from './screenRows';
import { rowSegments, type ColoredText } from './textColors';

function RowText({
  shown,
  from,
  to,
  colored,
  marks,
  blanks,
  widths,
}: {
  shown: ScreenRow;
  from: number;
  to: number;
  colored: ColoredText | undefined;
  marks: readonly FindMark[];
  blanks: boolean;
  widths: TextWidths | undefined;
}) {
  const { row } = shown;
  const pieces = (colored && rowSegments(colored, row)) ?? [{ text: row.text }];
  return (
    <MarkedText
      pieces={piecesWithin(pieces, from, to)}
      marks={marksWithin(marks, from, to)}
      blanks={blanks}
      widths={widths}
    />
  );
}

interface RowPart {
  readonly from: number;
  readonly to: number;
  readonly column: number;
}

interface TextRowProps {
  row: ScreenRow;
  part: RowPart | undefined;
  columns?: number | undefined;
  colored: ColoredText | undefined;
  marks: readonly FindMark[];
  showWhitespace: boolean;
  widths: TextWidths | undefined;
  dotLook: DotLook | undefined;
}

function samePart(one: RowPart | undefined, other: RowPart | undefined) {
  return (
    one === other ||
    (one !== undefined &&
      other !== undefined &&
      one.from === other.from &&
      one.to === other.to &&
      one.column === other.column)
  );
}

function drawnAlike(one: TextRowProps, other: TextRowProps): boolean {
  return (
    one.row === other.row &&
    samePart(one.part, other.part) &&
    one.columns === other.columns &&
    one.colored === other.colored &&
    (one.marks === other.marks ||
      (one.marks.length === 0 && other.marks.length === 0)) &&
    one.showWhitespace === other.showWhitespace &&
    one.widths === other.widths &&
    one.dotLook === other.dotLook
  );
}

export const TextRow = memo(function TextRow({
  row,
  part,
  columns = Infinity,
  colored,
  marks,
  showWhitespace,
  widths,
  dotLook,
}: TextRowProps) {
  const from = part?.from ?? row.from;
  const to = part?.to ?? row.to;
  return (
    <div
      className="viewer-row"
      data-key={`${row.row.start}:${row.from}`}
      data-continues={
        row.to < row.row.text.length || row.row.cut === true ? '' : undefined
      }
      style={
        (part?.column ?? 0) > 0
          ? {
              paddingInlineStart: `calc(${part?.column ?? 0} * var(--text-advance))`,
            }
          : undefined
      }
    >
      <RowText
        shown={row}
        from={from}
        to={to}
        colored={colored}
        marks={marks}
        blanks={showWhitespace}
        widths={widths}
      />
      {showWhitespace && dotLook && (
        <DotRowsShown
          look={dotLook}
          rows={spaceColumnsAt(
            row.row.text.slice(from, to),
            [0],
            columns - (part?.column ?? 0),
            widths && ((text) => columnsOf(text, widths)),
          )}
          left={`calc(${part?.column ?? 0} * var(--text-advance))`}
          alone
        />
      )}
      {!showWhitespace &&
        blankRuns(row.hanging).map(({ column, columns: run, tab: isTab }) => {
          const left = `calc(${column} * var(--text-advance))`;
          return isTab ? (
            <span
              key={column}
              className="viewer-wrap-blank"
              data-glyph={strings.symbols.tab}
              style={{ left }}
            />
          ) : (
            <span
              key={column}
              className="viewer-wrap-spaces"
              style={{
                left,
                width: `calc(${run} * var(--text-advance))`,
              }}
            />
          );
        })}
      {row.breakAt !== undefined && (
        <span
          className="viewer-break"
          data-glyph={strings.symbols.breaks}
          style={{
            left: `calc(${row.breakAt} * var(--text-advance))`,
          }}
        />
      )}
    </div>
  );
}, drawnAlike);

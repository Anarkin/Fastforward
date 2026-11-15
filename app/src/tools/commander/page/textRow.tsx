import { blankRuns } from '../../../lib/page/rowBreaks';
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

export function TextRow({
  row,
  part,
  colored,
  marks,
  showWhitespace,
  widths,
}: {
  row: ScreenRow;
  part:
    | { readonly from: number; readonly to: number; readonly column: number }
    | undefined;
  colored: ColoredText | undefined;
  marks: readonly FindMark[];
  showWhitespace: boolean;
  widths: TextWidths | undefined;
}) {
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
              paddingInlineStart: `calc(${part?.column ?? 0} * var(--commander-advance))`,
            }
          : undefined
      }
    >
      <RowText
        shown={row}
        from={part?.from ?? row.from}
        to={part?.to ?? row.to}
        colored={colored}
        marks={marks}
        blanks={showWhitespace}
        widths={widths}
      />
      {!showWhitespace &&
        blankRuns(row.hanging).map(({ column, columns: run, tab: isTab }) => {
          const left = `calc(${column} * var(--commander-advance))`;
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
                width: `calc(${run} * var(--commander-advance))`,
              }}
            />
          );
        })}
      {row.breakAt !== undefined && (
        <span
          className="viewer-break"
          data-glyph={strings.symbols.breaks}
          style={{
            left: `calc(${row.breakAt} * var(--commander-advance))`,
          }}
        />
      )}
    </div>
  );
}

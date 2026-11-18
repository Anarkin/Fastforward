import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  Fragment,
} from 'react';
import { strings } from '../../../lib/shared/strings';
import {
  blankRuns,
  rowBreaksAt,
  spaceColumnsAt,
  type ColumnsIn,
  type RowBreak,
} from '../../../lib/page/rowBreaks';
import { hasDots, type DotRows } from '../../../lib/page/dotRows';
import { DotRowsShown } from '../../../lib/page/dotRowsShown';
import {
  breaksMarked,
  wrapIndent,
  wrapStarts,
} from '../../../lib/page/wordWrap';
import { keptWrapStarts } from '../../../lib/page/wrapStarts';
import { numberWidth } from './textLayout';
import type { TextWidths } from '../../../lib/page/textWidths';
import {
  laidOutRowStarts,
  knownBreaks,
  rememberBreaks,
  unlaid,
  type LaidRows,
} from './rowBreaks';

export function WrapMarks({
  text,
  columns,
  numbers,
  lineHeight,
  columnsIn,
  widths,
  dotted = false,
}: {
  text: string;
  columns: number | undefined;
  numbers: number;
  lineHeight: number;
  columnsIn?: ColumnsIn;
  widths?: TextWidths;
  dotted?: boolean;
}) {
  const marks = useRef<HTMLSpanElement>(null);
  const expected = useMemo(
    () =>
      columns === undefined
        ? unlaid
        : (knownBreaks(text, columns, lineHeight, columnsIn) ??
          expectedRows(text, columns, columnsIn, widths)),
    [text, columns, lineHeight, columnsIn, widths],
  );
  const [laid, setLaid] = useState(expected);
  useLayoutEffect(() => {
    const code = marks.current?.parentElement?.querySelector('.code');
    if (columns === undefined || !(code instanceof HTMLElement)) {
      setLaid(unlaid);
      return undefined;
    }
    const measure = () => {
      const starts =
        (breaksMarked(text) &&
          laidOutRowStarts(code, lineHeight, expected.starts)) ||
        expected.starts;
      const measured =
        starts === undefined || starts === expected.starts
          ? expected
          : {
              starts,
              breaks: rowBreaksAt(
                text,
                starts,
                columns,
                columnsIn,
                wrapIndent(text, columns),
              ),
            };
      if (columnsIn !== undefined) {
        rememberBreaks(text, columns, lineHeight, columnsIn, measured);
      }
      setLaid(measured);
    };
    const known = knownBreaks(text, columns, lineHeight, columnsIn);
    if (known !== undefined) {
      setLaid(known);
      return undefined;
    }
    measure();
    let observed = false;
    const observer = new ResizeObserver(() => {
      if (observed) {
        measure();
      }
      observed = true;
    });
    observer.observe(code);
    return () => observer.disconnect();
  }, [text, columns, columnsIn, lineHeight, expected]);
  const { starts } = laid;
  const dots = useMemo(
    () =>
      dotted && columns !== undefined && starts !== undefined
        ? dottedRows(text, starts, columns, columnsIn)
        : undefined,
    [dotted, columns, starts, text, columnsIn],
  );
  if (columns === undefined) {
    return null;
  }
  return (
    <span className="wrap-marks" aria-hidden ref={marks}>
      <BreakMarks
        breaks={laid.breaks}
        dots={dots}
        numbers={numbers}
        lineHeight={lineHeight}
      />
    </span>
  );
}

function expectedRows(
  text: string,
  columns: number,
  columnsIn: ColumnsIn | undefined,
  widths: TextWidths | undefined,
): LaidRows {
  const indent = wrapIndent(text, columns);
  const starts = breaksMarked(text)
    ? wrapStarts(text, columns, indent, widths)
    : keptWrapStarts(text, columns, indent, widths);
  return {
    starts,
    breaks: rowBreaksAt(text, starts, columns, columnsIn, indent),
  };
}

function dottedRows(
  text: string,
  starts: readonly number[],
  columns: number,
  columnsIn: ColumnsIn | undefined,
): DotRows | undefined {
  return breaksMarked(text)
    ? spaceColumnsAt(
        text,
        starts,
        columns,
        columnsIn,
        wrapIndent(text, columns),
      )
    : undefined;
}

const blockRows = 64;

function MarksBlock({
  breaks,
  dots,
  rows,
  top,
  numbers,
  lineHeight,
}: {
  breaks: readonly RowBreak[];
  dots: DotRows | undefined;
  rows: number;
  top: number;
  numbers: number;
  lineHeight: number;
}) {
  const block = useRef<HTMLSpanElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const element = block.current;
    if (element === null) {
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => setNear(entries.some((entry) => entry.isIntersecting)),
      { root: element.closest('.virtual-rows'), rootMargin: '100% 0px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return (
    <span
      ref={block}
      className="wrap-block"
      style={{ top, height: rows * lineHeight }}
    >
      {near && (
        <BreakMarks
          breaks={breaks}
          dots={dots}
          numbers={numbers}
          lineHeight={lineHeight}
        />
      )}
    </span>
  );
}

export function BreakMarks({
  breaks,
  dots,
  numbers,
  lineHeight,
}: {
  breaks: readonly RowBreak[];
  dots?: DotRows | undefined;
  numbers: number;
  lineHeight: number;
}) {
  const rows = Math.max(breaks.length, dots?.length ?? 0);
  if (breaks.length === 0 && !hasDots(dots)) {
    return null;
  }
  if (rows > blockRows) {
    return Array.from({ length: Math.ceil(rows / blockRows) }, (_, block) => {
      const from = block * blockRows;
      const to = Math.min(rows, from + blockRows);
      return (
        <MarksBlock
          key={block}
          breaks={breaks.slice(from, to)}
          dots={dots?.slice(from, to)}
          rows={to - from}
          top={from * lineHeight}
          numbers={numbers}
          lineHeight={lineHeight}
        />
      );
    });
  }
  const at = (row: number, column: number) => ({
    top: row * lineHeight,
    left: `calc(${numbers * numberWidth}px + var(--diff-code-padding) + ${column} * var(--diff-advance))`,
  });
  return (
    <>
      {dots && (
        <DotRowsShown
          rows={dots}
          left={`calc(${numbers * numberWidth}px + var(--diff-code-padding))`}
        />
      )}
      {breaks.map(({ end, blanks }, row) => (
        <Fragment key={row}>
          {blankRuns(blanks).map(({ column, columns, tab }) =>
            tab ? (
              <span key={column} className="wrap-blank" style={at(row, column)}>
                {strings.symbols.tab}
              </span>
            ) : (
              <span
                key={column}
                className="wrap-spaces"
                style={{
                  ...at(row, column),
                  width: `calc(${columns} * var(--diff-advance))`,
                }}
              />
            ),
          )}
          <span className="wrap-break" style={at(row, end)}>
            {strings.symbols.breaks}
          </span>
        </Fragment>
      ))}
    </>
  );
}

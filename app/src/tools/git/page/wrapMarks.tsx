import { useEffect, useLayoutEffect, useRef, useState, Fragment } from 'react';
import { strings } from '../../../lib/shared/strings';
import {
  blankRuns,
  rowBreaksAt,
  type ColumnsIn,
  wrapIndent,
  wrapStarts,
  type RowBreak,
} from '../../../lib/page/wordWrap';
import { numberWidth } from './overflow';
import type { TextWidths } from '../../../lib/page/textWidths';
import {
  laidOutRowStarts,
  noBreaks,
  knownBreaks,
  rememberBreaks,
} from './rowMeasures';

export function WrapMarks({
  text,
  columns,
  numbers,
  lineHeight,
  columnsIn,
  widths,
}: {
  text: string;
  columns: number | undefined;
  numbers: number;
  lineHeight: number;
  columnsIn?: ColumnsIn;
  widths?: TextWidths;
}) {
  const marks = useRef<HTMLSpanElement>(null);
  const [breaks, setBreaks] = useState(
    () =>
      (columns !== undefined &&
        knownBreaks(text, columns, lineHeight, columnsIn)) ||
      noBreaks,
  );
  useLayoutEffect(() => {
    const code = marks.current?.parentElement?.querySelector('.code');
    if (columns === undefined || !(code instanceof HTMLElement)) {
      setBreaks(noBreaks);
      return undefined;
    }
    const measure = () => {
      const indent = wrapIndent(text, columns);
      const measured = rowBreaksAt(
        text,
        laidOutRowStarts(code, lineHeight) ??
          wrapStarts(text, columns, indent, widths),
        columns,
        columnsIn,
        indent,
      );
      if (columnsIn !== undefined) {
        rememberBreaks(text, columns, lineHeight, columnsIn, measured);
      }
      setBreaks(measured);
    };
    const known = knownBreaks(text, columns, lineHeight, columnsIn);
    if (known !== undefined) {
      setBreaks(known);
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
  }, [text, columns, columnsIn, widths, lineHeight]);
  if (columns === undefined) {
    return null;
  }
  return (
    <span className="wrap-marks" aria-hidden ref={marks}>
      <BreakMarks breaks={breaks} numbers={numbers} lineHeight={lineHeight} />
    </span>
  );
}

const blockRows = 64;

function MarksBlock({
  breaks,
  top,
  numbers,
  lineHeight,
}: {
  breaks: readonly RowBreak[];
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
      style={{ top, height: breaks.length * lineHeight }}
    >
      {near && (
        <BreakMarks breaks={breaks} numbers={numbers} lineHeight={lineHeight} />
      )}
    </span>
  );
}

export function BreakMarks({
  breaks,
  numbers,
  lineHeight,
}: {
  breaks: readonly RowBreak[];
  numbers: number;
  lineHeight: number;
}) {
  if (breaks.length === 0) {
    return null;
  }
  if (breaks.length > blockRows) {
    return Array.from(
      { length: Math.ceil(breaks.length / blockRows) },
      (_, block) => (
        <MarksBlock
          key={block}
          breaks={breaks.slice(block * blockRows, (block + 1) * blockRows)}
          top={block * blockRows * lineHeight}
          numbers={numbers}
          lineHeight={lineHeight}
        />
      ),
    );
  }
  const at = (row: number, column: number) => ({
    top: row * lineHeight,
    left: `calc(${numbers * numberWidth}px + var(--diff-code-padding) + ${column} * var(--diff-advance))`,
  });
  return (
    <>
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

export function selectionSide(
  target: Element | null,
): 'left' | 'right' | undefined {
  const side = target?.closest('.split-side');
  if (!side) {
    return undefined;
  }
  return side.parentElement?.firstElementChild === side ? 'left' : 'right';
}

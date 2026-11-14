import { memo, Fragment } from 'react';
import { type FindRange } from './find';
import type { SyntaxRange } from './syntax';
import { drawnText } from '../../../lib/page/blanks';
import { breakOffsets, leadLength } from '../../../lib/page/wordWrap';
import { wholeClusters, type TextWidths } from '../../../lib/page/textWidths';
import { type CodeProps } from './lineMarks';

function covering<T extends FindRange>(
  ranges: readonly T[],
): (start: number, end: number) => T | undefined {
  let next = 0;
  return (start, end) => {
    while (next < ranges.length && ranges[next].end <= start) {
      next++;
    }
    const range = ranges.at(next);
    return range && range.start <= start && end <= range.end
      ? range
      : undefined;
  };
}

function firstFrom(offsets: readonly number[], at: number): number {
  let low = 0;
  let high = offsets.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (offsets[middle] < at) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

function breakable(
  text: string,
  indent: number | undefined,
  shown: (piece: string) => React.ReactNode,
): (piece: string, start: number) => React.ReactNode {
  if (indent === undefined) {
    return shown;
  }
  const lead = indent > 0 ? leadLength(text) : 0;
  const breaks = breakOffsets(text);
  return (piece, start) => {
    const end = start + piece.length;
    const parts: React.ReactNode[] = [];
    let at = start;
    if (at < lead) {
      at = Math.min(lead, end);
      parts.push(
        <span key="lead" className="lead">
          {shown(text.slice(start, at))}
        </span>,
      );
    }
    for (
      let index = firstFrom(breaks, at);
      index < breaks.length && breaks[index] < end;
      index++
    ) {
      const offset = breaks[index];
      if (offset > at) {
        parts.push(
          <Fragment key={at}>{shown(text.slice(at, offset))}</Fragment>,
        );
      }
      parts.push(<wbr key={`break:${offset}`} />);
      at = offset;
    }
    if (parts.length === 0) {
      return shown(piece);
    }
    if (at < end) {
      parts.push(<Fragment key={at}>{shown(text.slice(at, end))}</Fragment>);
    }
    return parts;
  };
}

export function marked(
  text: string,
  syntax: readonly SyntaxRange[],
  words: readonly FindRange[],
  wordClass: string,
  found: readonly FindRange[],
  foundNow: FindRange | undefined,
  whitespace = false,
  indent?: number,
  widths?: TextWidths,
): React.ReactNode {
  const shown = breakable(text, indent, drawnText(whitespace, widths));
  if (words.length === 0 && syntax.length === 0 && found.length === 0) {
    return shown(text, 0);
  }
  const finds = wholeClusters(text, found);
  const [current] =
    foundNow === undefined ? [] : wholeClusters(text, [foundNow]);
  const edges = [
    ...new Set([
      0,
      text.length,
      ...[...syntax, ...words, ...finds].flatMap((range) => [
        range.start,
        range.end,
      ]),
    ]),
  ].toSorted((a, b) => a - b);
  const findAt = covering(finds);
  const tokenAt = covering(syntax);
  const wordAt = covering(words);
  const gaps = new Set(
    words.flatMap((word) => (word.start === word.end ? [word.start] : [])),
  );
  const gap = (at: number) =>
    gaps.has(at) && <span className={`word-gap ${wordClass}`} />;
  const pieces = edges.slice(0, -1).map((start, index) => {
    const end = edges[index + 1];
    const piece = text.slice(start, end);
    const find = findAt(start, end);
    const isCurrent =
      find !== undefined &&
      current?.start === find.start &&
      current.end === find.end;
    let content: React.ReactNode = find ? (
      <mark className={`find-match ${isCurrent ? 'current' : ''}`}>
        {shown(piece, start)}
      </mark>
    ) : (
      shown(piece, start)
    );
    const token = tokenAt(start, end);
    if (token) {
      content = <span className={`syntax-${token.kind}`}>{content}</span>;
    }
    return (
      <Fragment key={start}>
        {gap(start)}
        {wordAt(start, end) ? (
          <span className={wordClass}>{content}</span>
        ) : (
          content
        )}
      </Fragment>
    );
  });
  return gaps.has(text.length) ? (
    <>
      {pieces}
      {gap(text.length)}
    </>
  ) : (
    pieces
  );
}

export const Code = memo(function Code({
  text,
  syntax,
  words,
  wordClass,
  finds,
  current,
  whitespace,
  indent,
  widths,
}: CodeProps) {
  return (
    <span
      className="code"
      style={
        indent
          ? { '--wrap-indent': `calc(${indent} * var(--diff-advance))` }
          : undefined
      }
    >
      {marked(
        text,
        syntax,
        words,
        wordClass,
        finds,
        current,
        whitespace,
        indent,
        widths,
      )}
    </span>
  );
});

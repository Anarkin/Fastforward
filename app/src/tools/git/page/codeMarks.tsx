import { memo, Fragment } from 'react';
import { type FindRange } from './find';
import type { SyntaxRange } from './syntax';
import { DrawnText } from '../../../lib/page/blanks';
import { breakOffsets, leadLength } from '../../../lib/page/wordWrap';
import { type TextWidths } from '../../../lib/page/textWidths';
import { type CodeProps } from './lineMarks';
import { codePieces } from './codePieces';

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

export function MarkedCode({
  text,
  syntax,
  words,
  wordClass,
  found,
  foundNow,
  whitespace = false,
  indent,
  widths,
}: {
  readonly text: string;
  readonly syntax: readonly SyntaxRange[];
  readonly words: readonly FindRange[];
  readonly wordClass: string;
  readonly found: readonly FindRange[];
  readonly foundNow: FindRange | undefined;
  readonly whitespace?: boolean;
  readonly indent?: number;
  readonly widths?: TextWidths;
}): React.ReactNode {
  const shown = breakable(text, indent, (piece) => (
    <DrawnText text={piece} blanks={whitespace} widths={widths} />
  ));
  const { pieces, gapAfter } = codePieces(text, syntax, words, found, foundNow);
  if (pieces === undefined) {
    return shown(text, 0);
  }
  const gap = (has: boolean) =>
    has && <span className={`word-gap ${wordClass}`} />;
  const drawn = pieces.map(({ start, end, find, token, word, gapBefore }) => {
    const piece = text.slice(start, end);
    let content: React.ReactNode = find ? (
      <mark className={`find-match ${find === 'current' ? 'current' : ''}`}>
        {shown(piece, start)}
      </mark>
    ) : (
      shown(piece, start)
    );
    if (token) {
      content = <span className={`syntax-${token}`}>{content}</span>;
    }
    return (
      <Fragment key={start}>
        {gap(gapBefore)}
        {word ? <span className={wordClass}>{content}</span> : content}
      </Fragment>
    );
  });
  return gapAfter ? (
    <>
      {drawn}
      {gap(true)}
    </>
  ) : (
    drawn
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
      <MarkedCode
        text={text}
        syntax={syntax}
        words={words}
        wordClass={wordClass}
        found={finds}
        foundNow={current}
        whitespace={whitespace}
        indent={indent}
        widths={widths}
      />
    </span>
  );
});

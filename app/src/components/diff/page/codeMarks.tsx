import { memo, Fragment } from 'react';
import { type FindRange } from './find';
import type { SyntaxRange } from '../../syntax/page/engine';
import { DrawnText } from '../../../lib/page/blanks';
import {
  breakOffsets,
  breaksMarked,
  leadLength,
} from '../../../lib/page/wordWrap';
import { type TextWidths } from '../../../lib/page/textWidths';
import { type CodeProps } from './lineMarks';
import { codePieces, piecesWithin, type CodePiece } from './codePieces';
import { CodeBlocks } from './codeBlocks';
import { keptWrapStarts } from '../../../lib/page/wrapStarts';
import { spaceColumnsAt } from '../../../lib/page/rowBreaks';
import { DotRowsShown } from '../../../lib/page/dotRowsShown';

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

const noCopies: readonly FindRange[] = [];

const sameWord = (one: CodePiece, other: CodePiece) =>
  one.wordFrom !== undefined && one.wordFrom === other.wordFrom;

const sameToken = (one: CodePiece, other: CodePiece) =>
  one.tokenFrom !== undefined && one.tokenFrom === other.tokenFrom;

function runEnd(
  pieces: readonly CodePiece[],
  at: number,
  same: (one: CodePiece, other: CodePiece) => boolean,
): number {
  let end = at + 1;
  while (end < pieces.length && same(pieces[at], pieces[end])) {
    end++;
  }
  return end;
}

function runsOf(
  pieces: readonly CodePiece[],
  same: (one: CodePiece, other: CodePiece) => boolean,
): CodePiece[][] {
  const runs: CodePiece[][] = [];
  for (let at = 0; at < pieces.length;) {
    const end = runEnd(pieces, at, same);
    runs.push(pieces.slice(at, end));
    at = end;
  }
  return runs;
}

const colored = (group: readonly CodePiece[], content: React.ReactNode) =>
  group[0].token === undefined ? (
    content
  ) : (
    <span className={`syntax-${group[0].token}`}>{content}</span>
  );

export function MarkedCode({
  text,
  syntax,
  words,
  wordClass,
  found,
  foundNow,
  copies = noCopies,
  whitespace = false,
  spaceSpans = true,
  indent,
  widths,
  from = 0,
  to = text.length,
}: {
  readonly text: string;
  readonly syntax: readonly SyntaxRange[];
  readonly words: readonly FindRange[];
  readonly wordClass: string;
  readonly found: readonly FindRange[];
  readonly foundNow: FindRange | undefined;
  readonly copies?: readonly FindRange[];
  readonly whitespace?: boolean;
  readonly spaceSpans?: boolean;
  readonly indent?: number;
  readonly widths?: TextWidths;
  readonly from?: number;
  readonly to?: number;
}): React.ReactNode {
  const shown = breakable(text, indent, (piece) => (
    <DrawnText
      text={piece}
      blanks={whitespace}
      spaces={spaceSpans}
      widths={widths}
    />
  ));
  const { pieces, gapAfter } = codePieces(
    text,
    syntax,
    words,
    found,
    foundNow,
    copies,
  );
  if (pieces === undefined) {
    return shown(text.slice(from, to), from);
  }
  const gap = (has: boolean) =>
    has && <span className={`word-gap ${wordClass}`} />;
  const leaf = ({ start, end, find }: CodePiece) => {
    const piece = text.slice(start, end);
    return find === 'occurrence' ? (
      <mark className="occurrence-match">{shown(piece, start)}</mark>
    ) : find ? (
      <mark className={`find-match ${find === 'current' ? 'current' : ''}`}>
        {shown(piece, start)}
      </mark>
    ) : (
      shown(piece, start)
    );
  };
  const grouped = (
    run: readonly CodePiece[],
    same: (one: CodePiece, other: CodePiece) => boolean,
    wrapped: (
      group: readonly CodePiece[],
      content: React.ReactNode,
    ) => React.ReactNode,
  ) =>
    runsOf(run, same).map((group, index) => (
      <Fragment key={group[0].start}>
        {index > 0 && gap(group[0].gapBefore)}
        {wrapped(
          group,
          group.map((piece, at) => (
            <Fragment key={piece.start}>
              {at > 0 && gap(piece.gapBefore)}
              {leaf(piece)}
            </Fragment>
          )),
        )}
      </Fragment>
    ));
  const changed = (group: readonly CodePiece[], content: React.ReactNode) =>
    group[0].word ? <span className={wordClass}>{content}</span> : content;
  const within = piecesWithin(pieces, from, to);
  const drawn: React.ReactNode[] = [];
  for (let at = 0; at < within.length;) {
    const first = within[at];
    const wordEnd = runEnd(within, at, sameWord);
    const tokenEnd = runEnd(within, at, sameToken);
    const wordOutside = first.word && wordEnd >= tokenEnd;
    const end = wordOutside
      ? wordEnd
      : first.token === undefined
        ? at + 1
        : tokenEnd;
    const run = within.slice(at, end);
    drawn.push(
      <Fragment key={first.start}>
        {gap(first.gapBefore)}
        {wordOutside
          ? changed(run, grouped(run, sameToken, colored))
          : colored(run, grouped(run, sameWord, changed))}
      </Fragment>,
    );
    at = end;
  }
  return gapAfter && to === text.length ? (
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
  copies,
  whitespace,
  indent,
  widths,
  columns,
  lineHeight,
  columnsIn,
  dotLook,
  dotColumns,
  placed,
}: CodeProps) {
  const layered = whitespace && dotLook !== undefined && breaksMarked(text);
  const draw = (from?: number, to?: number) => (
    <MarkedCode
      text={text}
      syntax={syntax}
      words={words}
      wordClass={wordClass}
      found={finds}
      foundNow={current}
      copies={copies}
      whitespace={whitespace}
      spaceSpans={!layered}
      indent={indent}
      widths={widths}
      from={from}
      to={to}
    />
  );
  return (
    <span
      className="code"
      ref={placed}
      style={
        indent
          ? { '--wrap-indent': `calc(${indent} * var(--diff-advance))` }
          : undefined
      }
    >
      {indent === undefined ||
      columns === undefined ||
      lineHeight === undefined ||
      breaksMarked(text) ? (
        draw()
      ) : (
        <CodeBlocks
          starts={keptWrapStarts(text, columns, indent, widths)}
          length={text.length}
          lineHeight={lineHeight}
          current={current}
          draw={draw}
        />
      )}
      {layered && indent === undefined && (
        <DotRowsShown
          rows={spaceColumnsAt(text, [0], Infinity, columnsIn).map((spaces) =>
            dotColumns === undefined
              ? spaces
              : spaces.filter(
                  (column) => column >= dotColumns[0] && column < dotColumns[1],
                ),
          )}
          look={dotLook}
          left="0"
          alone
        />
      )}
    </span>
  );
});

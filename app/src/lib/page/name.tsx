import { Fragment } from 'react';
import type { Line, Sentence } from '../shared/sentences';
import { filterRanges } from '../shared/filter';
import { HighlightWords, Marked } from './highlight';

const piecesOf = (name: string) => name.split(/(?<=[\\/])/);

const noWords: readonly string[] = [];

export function Name({
  children,
  words = noWords,
}: {
  readonly children: string;
  readonly words?: readonly string[];
}) {
  const ranges = filterRanges(children, words);
  const starts = piecesOf(children).reduce<number[]>(
    (at, piece) => [...at, (at.at(-1) ?? 0) + piece.length],
    [0],
  );
  return (
    <code className="name">
      {piecesOf(children).map((piece, index) => (
        <span key={index}>
          <Marked text={piece} ranges={ranges} at={starts[index]} />
        </span>
      ))}
    </code>
  );
}

export function Words({
  children,
  words = noWords,
}: {
  readonly children: Sentence;
  readonly words?: readonly string[];
}) {
  return typeof children === 'string' ? (
    <HighlightWords text={children} words={words} />
  ) : (
    children.map((part, index) =>
      typeof part === 'string' ? (
        <HighlightWords key={index} text={part} words={words} />
      ) : (
        <Name key={index} words={words}>
          {part.name}
        </Name>
      ),
    )
  );
}

export function NameLines({ lines }: { readonly lines: readonly Line[] }) {
  return (
    <div className="name-lines">
      {lines.map((line) => (
        <Fragment key={line.label}>
          <span className="name-label">{line.label}</span>
          <span className="name-value">
            {'name' in line ? <Name>{line.name}</Name> : line.text}
          </span>
        </Fragment>
      ))}
    </div>
  );
}

import { Fragment } from 'react';
import type { Line, Sentence } from '../shared/sentences';
import { filterRanges, noFilter, type Filter } from '../shared/filter';
import { HighlightWords, Marked } from './highlight';

const piecesOf = (name: string) => name.split(/(?<=[\\/])/);

export function Name({
  children,
  filter = noFilter,
}: {
  readonly children: string;
  readonly filter?: Filter;
}) {
  const ranges = filterRanges(children, filter);
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
  filter = noFilter,
}: {
  readonly children: Sentence;
  readonly filter?: Filter;
}) {
  return typeof children === 'string' ? (
    <HighlightWords text={children} filter={filter} />
  ) : (
    children.map((part, index) =>
      typeof part === 'string' ? (
        <HighlightWords key={index} text={part} filter={filter} />
      ) : (
        <Name key={index} filter={filter}>
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

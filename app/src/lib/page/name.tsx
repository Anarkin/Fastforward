import { Fragment } from 'react';
import type { Line, Sentence } from '../shared/sentences';
import { filterRanges, noFilter, type Filter } from '../shared/filter';
import { HighlightWords, Marked } from './highlight';
import { PathName } from './pathName';

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

export function NamedPath({
  path,
  file = false,
  root,
  filter = noFilter,
}: {
  readonly path: string;
  readonly file?: boolean;
  readonly root?: string;
  readonly filter?: Filter;
}) {
  return (
    <code className="name">
      <PathName
        path={path}
        file={file}
        {...(root !== undefined && { root })}
        filter={filter}
      />
    </code>
  );
}

function NamedPart({
  part,
  filter = noFilter,
}: {
  readonly part: {
    readonly name: string;
    readonly path?: 'file' | 'folder';
    readonly root?: string;
  };
  readonly filter?: Filter;
}) {
  return part.path === undefined ? (
    <Name filter={filter}>{part.name}</Name>
  ) : (
    <NamedPath
      path={part.name}
      file={part.path === 'file'}
      {...(part.root !== undefined && { root: part.root })}
      filter={filter}
    />
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
        <NamedPart key={index} part={part} filter={filter} />
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
            {'name' in line ? <NamedPart part={line} /> : line.text}
          </span>
        </Fragment>
      ))}
    </div>
  );
}

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
    <code className="name named-path">
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
  boxed = true,
}: {
  readonly part: {
    readonly name: string;
    readonly path?: 'file' | 'folder';
    readonly root?: string;
  };
  readonly filter?: Filter;
  readonly boxed?: boolean;
}) {
  if (part.path === undefined) {
    return boxed ? (
      <Name filter={filter}>{part.name}</Name>
    ) : (
      <HighlightWords text={part.name} filter={filter} />
    );
  }
  const shown = {
    path: part.name,
    file: part.path === 'file',
    ...(part.root !== undefined && { root: part.root }),
    filter,
  };
  return boxed ? <NamedPath {...shown} /> : <PathName {...shown} />;
}

export function Words({
  children,
  filter = noFilter,
  boxed = true,
}: {
  readonly children: Sentence;
  readonly filter?: Filter;
  readonly boxed?: boolean;
}) {
  return typeof children === 'string' ? (
    <HighlightWords text={children} filter={filter} />
  ) : (
    children.map((part, index) =>
      typeof part === 'string' ? (
        <HighlightWords key={index} text={part} filter={filter} />
      ) : (
        <NamedPart key={index} part={part} filter={filter} boxed={boxed} />
      ),
    )
  );
}

export function NameLines({ lines }: { readonly lines: readonly Line[] }) {
  return (
    <div className="name-lines">
      {lines.map((line, index) => (
        <Fragment key={index}>
          {line.label !== undefined && (
            <span className="name-label">{line.label}</span>
          )}
          <span
            className={
              line.label === undefined ? 'name-value name-alone' : 'name-value'
            }
          >
            {'name' in line ? <NamedPart part={line} /> : line.text}
          </span>
        </Fragment>
      ))}
    </div>
  );
}

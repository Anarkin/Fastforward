import { Fragment } from 'react';
import type { Line } from '../shared/strings';

const piecesOf = (name: string) => name.split(/(?<=[\\/])/);

export function Name({ children }: { readonly children: string }) {
  return (
    <code className="name">
      {piecesOf(children).map((piece, index) => (
        <span key={index}>{piece}</span>
      ))}
    </code>
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

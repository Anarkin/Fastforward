import type { CSSProperties, ReactNode } from 'react';
import { pathParts } from '../shared/paths';

export function nameOf(path: string): string {
  return pathParts(path).at(-1)?.name ?? '';
}

function flatSuffixOf(path: string): string {
  if (/[\\/]$/.test(path)) {
    return '**';
  }
  return path.includes('\\') || !path.includes('/') ? '\\**' : '/**';
}

export function PathTitle({
  path,
  hidden,
  color,
  flat = false,
  children,
}: {
  readonly path: string;
  readonly hidden: readonly boolean[];
  readonly color?: string;
  readonly flat?: boolean;
  readonly children?: ReactNode;
}) {
  const parts = pathParts(path);
  const last = parts.length - 1;
  const hiddenAt = (index: number) => (hidden[index] ? ' hidden' : '');
  const style: CSSProperties | undefined =
    color === undefined ? undefined : { '--file-color': color };
  return (
    <span className="column-name path-title">
      {children}
      {last > 0 && (
        <span className="path-folder">
          {parts.slice(0, last).map((part, index) => [
            <span key={part.path} className={`path-part${hiddenAt(index)}`}>
              {part.name}
            </span>,
            part.separator,
          ])}
        </span>
      )}
      {last >= 0 && (
        <span
          className={`path-name${color === undefined ? '' : ' colored'}${hiddenAt(last)}`}
          style={style}
        >
          {parts[last].name}
          {parts[last].separator}
        </span>
      )}
      {flat && <span className="path-flat">{flatSuffixOf(path)}</span>}
    </span>
  );
}

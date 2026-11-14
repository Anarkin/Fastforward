import type { CSSProperties } from 'react';
import { strings } from '../../../lib/shared/strings';
import { pathParts } from '../shared/paths';

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
  coloredPart,
  flat = false,
  duplicates = false,
}: {
  readonly path: string;
  readonly hidden: readonly boolean[];
  readonly color?: string;
  readonly coloredPart?: number;
  readonly flat?: boolean;
  readonly duplicates?: boolean;
}) {
  const parts = pathParts(path);
  const last = parts.length - 1;
  const hiddenAt = (index: number) => (hidden[index] ? ' hidden' : '');
  const colored = color === undefined ? undefined : (coloredPart ?? last);
  const coloredAt = (index: number) => (index === colored ? ' colored' : '');
  const styleAt = (index: number): CSSProperties | undefined =>
    index === colored && color !== undefined
      ? { '--file-color': color }
      : undefined;
  return (
    <span className="column-name path-title">
      <span className="path-text">
        {last > 0 && (
          <span className="path-folder">
            <span dir="ltr">
              {parts.slice(0, last).map((part, index) => [
                <span
                  key={part.path}
                  className={`path-part${coloredAt(index)}${hiddenAt(index)}`}
                  style={styleAt(index)}
                >
                  {part.name}
                </span>,
                part.separator,
              ])}
            </span>
          </span>
        )}
        <span className="path-end">
          {last >= 0 && (
            <span
              className={`path-name${coloredAt(last)}${hiddenAt(last)}`}
              style={styleAt(last)}
            >
              {parts[last].name}
              {parts[last].separator}
            </span>
          )}
          {flat && <span className="path-flat">{flatSuffixOf(path)}</span>}
          {duplicates && (
            <span className="path-duplicates">
              {strings.commander.duplicatesTag}
            </span>
          )}
        </span>
      </span>
    </span>
  );
}

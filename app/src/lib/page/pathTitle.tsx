import { strings } from '../shared/strings';
import { usePathParts, type PartLooks } from './pathLooks';

function flatSuffixOf(path: string): string {
  if (/[\\/]$/.test(path)) {
    return '**';
  }
  return path.includes('\\') || !path.includes('/') ? '\\**' : '/**';
}

export function PathTitle({
  path,
  file = false,
  looks,
  flat = false,
  duplicates = false,
}: {
  readonly path: string;
  readonly file?: boolean;
  readonly looks?: PartLooks;
  readonly flat?: boolean;
  readonly duplicates?: boolean;
}) {
  const parts = usePathParts(path, { file, ...(looks && { looks }) });
  const last = parts.length - 1;
  return (
    <span className="column-name path-title">
      <span className="path-text">
        {last > 0 && (
          <span className="path-folder">
            <span dir="ltr">
              {parts.slice(0, last).map((part) => [
                <span
                  key={part.key}
                  className={part.className}
                  style={part.style}
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
              className={`path-name ${parts[last].className}`}
              style={parts[last].style}
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

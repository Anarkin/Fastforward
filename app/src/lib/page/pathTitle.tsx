import { strings } from '../shared/strings';
import { usePathParts, type PartLooks } from './pathLooks';
import { PathPart } from './pathPart';

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
  goTo,
}: {
  readonly path: string;
  readonly file?: boolean;
  readonly looks?: PartLooks;
  readonly flat?: boolean;
  readonly duplicates?: boolean;
  readonly goTo?: () => void;
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
                <PathPart key={part.key} part={part}>
                  {part.name}
                </PathPart>,
                part.separator,
              ])}
            </span>
          </span>
        )}
        <span className="path-end">
          {last >= 0 && (
            <PathPart part={parts[last]} className="path-name" onGoTo={goTo}>
              {parts[last].name}
              {parts[last].separator}
            </PathPart>
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

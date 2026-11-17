import { filterRanges, noFilter, type Filter } from '../shared/filter';
import { Marked } from './highlight';
import { usePathParts, type PartLooks } from './pathLooks';
import { PathPart } from './pathPart';

export function PathName({
  path,
  file = false,
  looks,
  root,
  filter = noFilter,
  goTo,
}: {
  readonly path: string;
  readonly file?: boolean;
  readonly looks?: PartLooks;
  readonly root?: string;
  readonly filter?: Filter;
  readonly goTo?: () => void;
}) {
  const parts = usePathParts(path, {
    file,
    ...(looks && { looks }),
    ...(root !== undefined && { root }),
  });
  const ranges = filterRanges(path, filter);
  return parts.map((part, index) => (
    <span key={part.key} className="path-piece">
      <PathPart
        part={part}
        onGoTo={index === parts.length - 1 ? goTo : undefined}
      >
        <Marked text={part.name} ranges={ranges} at={part.at} />
      </PathPart>
      <Marked
        text={part.separator}
        ranges={ranges}
        at={part.at + part.name.length}
      />
    </span>
  ));
}

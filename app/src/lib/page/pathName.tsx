import { filterRanges, noFilter, type Filter } from '../shared/filter';
import { Marked } from './highlight';
import { usePathParts, type PartLooks } from './pathLooks';

export function PathName({
  path,
  file = false,
  looks,
  root,
  filter = noFilter,
}: {
  readonly path: string;
  readonly file?: boolean;
  readonly looks?: PartLooks;
  readonly root?: string;
  readonly filter?: Filter;
}) {
  const parts = usePathParts(path, {
    file,
    ...(looks && { looks }),
    ...(root !== undefined && { root }),
  });
  const ranges = filterRanges(path, filter);
  return parts.map((part) => (
    <span key={part.key}>
      <span className={part.className} style={part.style}>
        <Marked text={part.name} ranges={ranges} at={part.at} />
      </span>
      <Marked
        text={part.separator}
        ranges={ranges}
        at={part.at + part.name.length}
      />
    </span>
  ));
}

import { filterRanges, noFilter, type Filter } from '../shared/filter';
import { Marked } from './highlight';
import { usePathParts, type PartLooks, type ShownPart } from './pathLooks';
import { PathPart } from './pathPart';

interface PathShown {
  readonly path: string;
  readonly file?: boolean;
  readonly looks?: PartLooks;
  readonly root?: string;
  readonly filter?: Filter;
}

function usePartsOf({ path, file = false, looks, root }: PathShown) {
  return usePathParts(path, {
    file,
    ...(looks && { looks }),
    ...(root !== undefined && { root }),
  });
}

function Pieces({
  path,
  parts,
  filter,
}: {
  readonly path: string;
  readonly parts: readonly ShownPart[];
  readonly filter: Filter;
}) {
  const ranges = filterRanges(path, filter);
  return parts.map((part) => (
    <span key={part.key} className="path-piece">
      <PathPart part={part}>
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

export function PathName(shown: PathShown) {
  return (
    <Pieces
      path={shown.path}
      parts={usePartsOf(shown)}
      filter={shown.filter ?? noFilter}
    />
  );
}

export function CutPathName({
  className,
  ...shown
}: PathShown & { readonly className: string }) {
  const parts = usePartsOf(shown);
  const last = parts.at(-1);
  const looks = (last?.className ?? '')
    .split(' ')
    .filter((name) => ['colored', 'hidden'].includes(name));
  return (
    <span
      className={[className, 'path-cut', ...looks].join(' ')}
      style={last?.style}
    >
      <Pieces
        path={shown.path}
        parts={parts}
        filter={shown.filter ?? noFilter}
      />
    </span>
  );
}

import { filterRanges, type Filter } from '../../../lib/shared/filter';
import { Marked } from '../../../lib/page/highlight';
import { usePathParts } from '../../../lib/page/pathLooks';
import { PathPart } from '../../../lib/page/pathPart';
import type { Row } from './listing';

export function TileName({
  row,
  filter,
}: {
  readonly row: Row;
  readonly filter: Filter;
}) {
  const name = row.extension === '' ? row.base : `${row.base}.${row.extension}`;
  const { entry } = row;
  const [part] = usePathParts(name, {
    file: entry !== undefined && !entry.folder,
    ...(entry !== undefined && {
      looks: [
        {
          hidden: entry.hidden,
          file: !entry.folder,
          executable: entry.executable === true,
        },
      ],
    }),
  });
  const ranges = filterRanges(name, filter);
  return (
    <div className="commander-tile-name">
      {part !== undefined && (
        <PathPart part={part} menu={false}>
          <span className="commander-tile-base">
            <Marked text={row.base} ranges={ranges} />
          </span>
          {row.extension !== '' && (
            <span className="commander-tile-extension">
              <Marked
                text={`.${row.extension}`}
                ranges={ranges}
                at={row.base.length}
              />
            </span>
          )}
        </PathPart>
      )}
    </div>
  );
}

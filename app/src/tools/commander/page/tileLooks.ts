import { filterRanges } from '../../../lib/shared/filter';
import type { FindRange } from '../../../lib/shared/textMatches';
import { shownParts } from '../../../lib/page/pathLooks';
import { formatDate } from '../../../lib/page/dates';
import { imageType, vectorType } from '../../../lib/shared/images';
import { type Row } from './listing';
import { formatSize } from './format';
import { rowClassesOf, type LineSettings, type LineState } from './lineLooks';

export interface TileLook {
  readonly key: string;
  readonly classes: string;
  readonly up: boolean;
  readonly folder: boolean;
  readonly base: string;
  readonly extension: string;
  readonly nameClass: string;
  readonly nameColor: string | undefined;
  readonly size: string;
  readonly date: string;
  readonly baseFound: readonly FindRange[];
  readonly extensionFound: readonly FindRange[];
  readonly counting: boolean;
  readonly image: 'raster' | 'vector' | undefined;
}

export function tileLookOf(
  row: Row,
  state: LineState,
  { fileColors, dateFormat, filter }: LineSettings,
  dotHides = false,
): TileLook {
  const { entry } = row;
  const folder = entry === undefined || entry.folder;
  const extension = row.extension === '' ? '' : `.${row.extension}`;
  const name = `${row.base}${extension}`;
  const [part] = shownParts(
    name,
    !folder,
    entry === undefined
      ? undefined
      : [
          {
            hidden: entry.hidden,
            file: !entry.folder,
            executable: entry.executable === true,
          },
        ],
    fileColors,
    dotHides,
  );
  const found = filterRanges(name, filter);
  const type = imageType(row.key);
  return {
    key: row.key,
    classes: [...rowClassesOf(row, state, fileColors), 'commander-tile'].join(
      ' ',
    ),
    up: entry === undefined,
    folder,
    base: row.base,
    extension,
    nameClass: part?.className ?? '',
    nameColor: part?.style?.['--file-color'],
    size: formatSize(entry?.size),
    date:
      entry?.modified === undefined
        ? ''
        : formatDate(entry.modified, dateFormat),
    baseFound: found.flatMap((range) =>
      range.start < row.base.length
        ? [{ start: range.start, end: Math.min(range.end, row.base.length) }]
        : [],
    ),
    extensionFound: found.flatMap((range) =>
      range.end > row.base.length
        ? [
            {
              start: Math.max(0, range.start - row.base.length),
              end: range.end - row.base.length,
            },
          ]
        : [],
    ),
    counting: entry?.counting === true,
    image:
      entry === undefined || entry.folder || type === undefined
        ? undefined
        : type === vectorType
          ? 'vector'
          : 'raster',
  };
}

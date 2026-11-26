import { filterRanges, type Filter } from '../../../lib/shared/filter';
import type { FindRange } from '../../../lib/shared/textMatches';
import { groupOfEntry, type FileColors } from '../../../lib/page/fileColors';
import { fileColorClass } from '../../../lib/shared/fileColors';
import { formatDate } from '../../../lib/page/dates';
import { type Row } from './listing';
import { formatSize } from './format';

export interface LineState {
  readonly selected: boolean;
  readonly marked: boolean;
  readonly startsGroup: boolean;
  readonly dropTarget: boolean;
}

export interface LineSettings {
  readonly fileColors: FileColors;
  readonly gitMissing: boolean;
  readonly dateFormat: string;
  readonly filter: Filter;
}

export interface LineLook {
  readonly key: string;
  readonly classes: string;
  readonly up: boolean;
  readonly folder: boolean;
  readonly hidden: boolean;
  readonly name: string;
  readonly extension: string;
  readonly size: string;
  readonly date: string;
  readonly nameFound: readonly FindRange[];
  readonly extensionFound: readonly FindRange[];
  readonly counting: boolean;
  readonly unread: number | undefined;
  readonly repository: boolean;
}

export function rowClassesOf(row: Row, state: LineState, colors: FileColors) {
  const { entry } = row;
  const group = entry === undefined ? undefined : groupOfEntry(entry, colors);
  return [
    'row',
    'commander-row',
    ...(state.selected ? ['selected'] : []),
    ...(state.marked ? ['marked'] : []),
    ...(entry?.hidden === true ? ['hidden'] : []),
    ...(entry === undefined || entry.folder ? ['commander-folder'] : []),
    ...(state.dropTarget ? ['drop-target'] : []),
    ...(group === undefined ? [] : ['colored', fileColorClass(group)]),
    ...(state.startsGroup ? ['group-start'] : []),
  ];
}

export function lineLookOf(
  row: Row,
  state: LineState,
  { fileColors, gitMissing, dateFormat, filter }: LineSettings,
): LineLook {
  const { entry } = row;
  const folder = entry === undefined || entry.folder;
  const repository = !gitMissing && row.repository;
  const shift = folder ? 1 : 0;
  return {
    key: row.key,
    classes: [
      ...rowClassesOf(row, state, fileColors),
      'commander-line',
      ...(entry === undefined ? ['up'] : []),
    ].join(' '),
    up: entry === undefined,
    folder,
    hidden: entry?.hidden === true,
    name: folder ? `[${row.base}]` : row.base,
    extension: repository ? '' : row.extension,
    size: formatSize(entry?.size),
    date:
      entry?.modified === undefined
        ? ''
        : formatDate(entry.modified, dateFormat),
    nameFound: filterRanges(row.base, filter).map(({ start, end }) => ({
      start: start + shift,
      end: end + shift,
    })),
    extensionFound: repository ? [] : filterRanges(row.extension, filter),
    counting: entry?.counting === true,
    unread: entry?.unreadFolders,
    repository,
  };
}

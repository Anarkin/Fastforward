import { filterRanges, narrows, type Filter } from '../../../lib/shared/filter';
import { fitsColumn } from './cellFit';

export interface LineCells {
  readonly name: string;
  readonly extension: string;
  readonly size: string;
  readonly date: string;
}

export interface LineRoom {
  readonly name: number | undefined;
  readonly extension: number;
  readonly size: number;
  readonly date: number;
}

const between = '  ';

const hair = 0.001;

export function nameRoom(width: number, gap: number): number | undefined {
  const advance = gap / between.length;
  return advance > 0 ? Math.floor(width / advance + hair) : undefined;
}

function marks(text: string, filter: Filter): boolean {
  return filterRanges(text, filter).length > 0;
}

export function plainLine(
  { name, extension, size, date }: LineCells,
  room: LineRoom,
  filter: Filter,
): string | undefined {
  if (
    room.name === undefined ||
    !fitsColumn(name, room.name) ||
    !fitsColumn(extension, room.extension) ||
    !fitsColumn(size, room.size) ||
    !fitsColumn(date, room.date) ||
    (narrows(filter) && (marks(name, filter) || marks(extension, filter)))
  ) {
    return undefined;
  }
  return `${name}\t${extension.padEnd(room.extension)}${between}${size.padStart(room.size)}${between}${date}`.trimEnd();
}

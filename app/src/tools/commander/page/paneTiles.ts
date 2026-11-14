import { thumbnailUrl, type IconSource } from '../shared/icons';
import {
  imageType,
  maxImageSize,
  vectorType,
} from '../../../lib/shared/images';
import { type FillItem } from './thumbnailFills';
import { type Entry, type Side } from '../shared/protocol';
import { type Row } from './listing';

export function driveOf(
  folder: string,
  drives: readonly string[],
): string | undefined {
  return drives.find((drive) =>
    folder.toUpperCase().startsWith(drive.toUpperCase()),
  );
}

export function dropIntoOf(target: EventTarget | null): string | null {
  const row = target instanceof Element ? target.closest('[data-drop]') : null;
  return row?.getAttribute('data-drop') ?? null;
}

export function tileThumbnailUrl(source: IconSource, entry: Entry): string {
  return thumbnailUrl(source, `${entry.size ?? ''}:${entry.modified ?? ''}`);
}

export const fillDelay = 250;

export type ThumbnailFill = FillItem & {
  readonly index: number;
  readonly source: IconSource;
};

export function thumbnailFills(
  rows: readonly Row[],
  shown: { readonly tab: string; readonly side: Side; readonly folder: string },
): ThumbnailFill[] {
  return rows.flatMap((row, index): ThumbnailFill[] => {
    const type = imageType(row.key);
    if (
      row.entry === undefined ||
      row.entry.folder ||
      type === undefined ||
      type === vectorType ||
      (row.entry.size ?? 0) > maxImageSize
    ) {
      return [];
    }
    const source = { ...shown, name: row.key };
    return [
      {
        url: tileThumbnailUrl(source, row.entry),
        name: row.key,
        index,
        source,
      },
    ];
  });
}

export function tileRowsOf(rows: readonly Row[], across: number) {
  return {
    count: Math.ceil(rows.length / across),
    keyOf: (index: number) => rows[index * across].key,
    indexOf: (key: string) => {
      const at = rows.findIndex((row) => row.key === key);
      return at === -1 ? -1 : Math.floor(at / across);
    },
  };
}

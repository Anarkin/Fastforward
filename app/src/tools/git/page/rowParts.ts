import type { FileColors } from '../../../lib/page/fileColors';
import {
  isWhole,
  joinedPath,
  shownParts,
  wholePath,
  type KnownLooks,
} from '../../../lib/page/pathLooks';
import { pathParts } from '../../../lib/shared/pathParts';

interface RowPart {
  readonly name: string;
  readonly at: number;
  readonly whole: string;
  readonly file: boolean;
  readonly color: string | undefined;
  readonly hidden: boolean;
}

export interface RowParts {
  readonly parts: readonly RowPart[];
  readonly unknown: string | undefined;
}

export function rowParts(
  name: string,
  file: boolean,
  root: string | undefined,
  {
    known,
    fileColors,
    dotHides,
  }: {
    readonly known: KnownLooks;
    readonly fileColors: FileColors;
    readonly dotHides: boolean;
  },
): RowParts {
  const whole = joinedPath(root, name);
  const count = pathParts(name).length;
  const looks = isWhole(whole)
    ? pathParts(whole).map((part) => known.get(part.path))
    : undefined;
  return {
    parts: shownParts(
      name,
      file,
      looks?.slice(looks.length - count),
      fileColors,
      dotHides,
    ).map((part) => ({
      name: part.name,
      at: part.at,
      whole: root === undefined ? part.key : wholePath(root, part.key),
      file: part.file,
      color: part.style?.['--file-color'],
      hidden: part.className.split(' ').includes('hidden'),
    })),
    unknown: looks?.includes(undefined) === true ? whole : undefined,
  };
}

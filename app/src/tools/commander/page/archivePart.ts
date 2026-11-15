import { fileColorOf, type FileColors } from './fileColors';
import { nameOf } from './pathNames';
import { pathParts } from '../shared/paths';

export function archivePart(
  archive: string,
  fileColors: FileColors,
): { readonly color?: string; readonly coloredPart: number } {
  const color = fileColorOf(
    {
      name: nameOf(archive),
      folder: false,
      link: false,
      hidden: false,
      size: undefined,
      modified: undefined,
    },
    fileColors,
  );
  return {
    ...(color !== undefined && { color }),
    coloredPart: pathParts(archive).length - 1,
  };
}

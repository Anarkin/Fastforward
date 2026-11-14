import { layouts, type Layout } from '../shared/settings';
import type { ContextMenuItem } from '../../../lib/page/menuControls';
import { strings } from '../../../lib/shared/strings';
import { fileColorOf, type FileColors } from './fileColors';
import { nameOf } from './pathNames';
import { pathParts } from '../shared/paths';

export function layoutMenu({
  layout,
  groupByColor,
  canGroupByColor,
  onLayout,
  onGroupByColor,
}: {
  readonly layout: Layout;
  readonly groupByColor: boolean;
  readonly canGroupByColor: boolean;
  readonly onLayout: (layout: Layout) => void;
  readonly onGroupByColor: () => void;
}): ContextMenuItem[] {
  return [
    ...layouts.map((each) => ({
      label: strings.commander.layouts[each],
      checked: each === layout,
      onClick: () => onLayout(each),
    })),
    { separator: true },
    {
      label: strings.commander.groupByColor,
      checked: groupByColor && canGroupByColor,
      disabled: !canGroupByColor,
      onClick: onGroupByColor,
    },
  ];
}

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

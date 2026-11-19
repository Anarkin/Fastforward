import { commanderKeymap } from './keymap';
import { keysOf } from '../../../lib/shared/keymap';
import { layouts, type Layout } from './layouts';
import type { ContextMenuItem } from '../../../lib/page/contextMenuItem';
import { strings } from '../../../lib/shared/strings';

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
      keys: keysOf(commanderKeymap.layout, each),
      checked: each === layout,
      onClick: () => onLayout(each),
    })),
    { separator: true },
    {
      label: strings.commander.groupByColor,
      keys: keysOf(commanderKeymap.groupByColor),
      checked: groupByColor && canGroupByColor,
      disabled: !canGroupByColor,
      onClick: onGroupByColor,
    },
  ];
}

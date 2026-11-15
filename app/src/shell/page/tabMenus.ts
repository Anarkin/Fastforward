import { type WindowInfo } from '../shared/protocol';
import type { ContextMenuItem } from '../../lib/page/contextMenuItem';
import { strings } from '../../lib/shared/strings';
import { tools, type ToolId } from '../shared/tools';

export function tabMenuItems(
  tab: string,
  alone: boolean,
  windows: readonly WindowInfo[],
  move: (tab: string, window?: string) => void,
): ContextMenuItem[] {
  return [
    {
      label: strings.tabs.moveToNewWindow,
      disabled: alone,
      onClick: () => move(tab),
    },
    ...(windows.length === 0
      ? []
      : [
          {
            label: strings.tabs.moveToWindow,
            submenu: windows.map((window) => ({
              label: window.name,
              onClick: () => move(tab, window.id),
            })),
          },
        ]),
  ];
}

export const newTabTrigger = '.tab-add';

export function newTabItems(
  items: Partial<Record<ToolId, readonly ContextMenuItem[]>>,
  onNewTab: (tool: ToolId) => void,
): ContextMenuItem[] {
  return tools.map((tool) => {
    const label = strings.tools[tool];
    const icon = tool;
    const submenu = items[tool];
    return submenu === undefined
      ? { label, icon, onClick: () => onNewTab(tool) }
      : { label, icon, submenu };
  });
}

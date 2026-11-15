import type { OpenMenu } from '../../lib/page/contextMenuItem';

export interface TabMenu {
  readonly tab: string | undefined;
  readonly menu: OpenMenu;
  readonly id: number;
}

export function nextMenu(
  previous: TabMenu | undefined,
  tab: string | undefined,
  menu: OpenMenu,
): TabMenu {
  return { tab, menu, id: (previous?.id ?? 0) + 1 };
}

export function menuIn(
  opened: TabMenu | undefined,
  tab: string | undefined,
): OpenMenu | undefined {
  return opened !== undefined && opened.tab === tab ? opened.menu : undefined;
}

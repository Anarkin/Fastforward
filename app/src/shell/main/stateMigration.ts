import { isObject } from '../../lib/main/json';
import { activeTabKey, tabsKey, toolsKey } from './storage';
import { isSavedTab } from './savedTabs';

const gitStateOfVersion22 = [
  'recentRepositories',
  'solo',
  'bookmarks',
  'activeWorktrees',
  'lastFetches',
  'remoteTags',
];

const droppedStateOfVersion22 = ['tabsGrouped'];

export function migratedState(
  values: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const moved = gitStateOfVersion22.filter((key) => values[key] !== undefined);
  const dropped = droppedStateOfVersion22.filter(
    (key) => values[key] !== undefined,
  );
  const saved: unknown = values[tabsKey];
  const tabs: readonly unknown[] = Array.isArray(saved) ? saved : [];
  const roots = tabs.filter((tab) => typeof tab === 'string');
  if (moved.length + dropped.length + roots.length === 0) {
    return undefined;
  }
  const result = { ...values };
  for (const key of [...moved, ...dropped]) {
    delete result[key];
  }
  if (moved.length > 0) {
    const tools = isObject(values[toolsKey]) ? values[toolsKey] : {};
    result[toolsKey] = {
      ...tools,
      git: {
        ...Object.fromEntries(moved.map((key) => [key, values[key]])),
        ...(isObject(tools.git) ? tools.git : {}),
      },
    };
  }
  if (roots.length > 0) {
    const ids = tabs.filter(isSavedTab).map((tab) => Number(tab.id));
    let next = Math.max(0, ...ids.filter(Number.isInteger)) + 1;
    const migratedTabs = tabs.map((tab) =>
      typeof tab === 'string'
        ? { id: String(next++), tool: 'git', root: tab }
        : tab,
    );
    result[tabsKey] = migratedTabs;
    const activeTab = migratedTabs[tabs.indexOf(values[activeTabKey])];
    if (typeof values[activeTabKey] === 'string' && isSavedTab(activeTab)) {
      result[activeTabKey] = activeTab.id;
    }
  }
  return result;
}

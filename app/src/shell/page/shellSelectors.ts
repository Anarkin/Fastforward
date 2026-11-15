import type { TabInfo } from '../shared/protocol';
import type { ShellSource } from './shellState';

export function activeTabOf({
  tabs,
  active,
}: ShellSource): TabInfo | undefined {
  return tabs?.find((tab) => tab.id === active);
}

export function comparingOf(state: ShellSource): string | undefined {
  const tab = activeTabOf(state);
  return tab?.compare === true ? tab.id : undefined;
}

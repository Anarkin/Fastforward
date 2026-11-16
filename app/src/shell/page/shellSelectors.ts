import type { TabInfo } from '../shared/protocol';
import type { ShellSource } from './shellState';

export function activeTabOf({
  tabs,
  active,
}: ShellSource): TabInfo | undefined {
  return tabs?.find((tab) => tab.id === active);
}

import type { TabInfo } from '../shared/protocol';
import type { ShellSource } from './state';

export function activeTabOf({
  tabs,
  active,
}: ShellSource): TabInfo | undefined {
  return tabs?.find((tab) => tab.id === active);
}

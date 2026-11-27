import type { TabInfo } from '../shared/protocol';
import type { ToolId } from '../shared/tools';
import type { ShellSource } from './state';

export function soleToolOf({
  tabs,
}: Pick<ShellSource, 'tabs'>): ToolId | undefined {
  const tool = tabs?.[0]?.tool;
  return tool !== undefined && tabs?.every((tab) => tab.tool === tool)
    ? tool
    : undefined;
}

export function activeTabOf({
  tabs,
  active,
}: ShellSource): TabInfo | undefined {
  return tabs?.find((tab) => tab.id === active);
}

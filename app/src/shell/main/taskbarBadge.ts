import { strings } from '../../lib/shared/strings';
import { isTool, type ToolId } from '../shared/tools';

export interface TaskbarBadge {
  readonly png: string;
  readonly description: string;
}

const longestBadge = 64 * 1024;
const pngData = /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/;

export function taskbarBadgeOf(
  tool: unknown,
  png: unknown,
  tabs: readonly { readonly tool: ToolId }[],
): TaskbarBadge | undefined {
  return isTool(tool) &&
    typeof png === 'string' &&
    png.length <= longestBadge &&
    pngData.test(png) &&
    tabs.length > 0 &&
    tabs.every((tab) => tab.tool === tool)
    ? { png, description: strings.tools[tool] }
    : undefined;
}

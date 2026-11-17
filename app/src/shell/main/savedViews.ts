import { maxViewChars } from '../shared/protocol';
import { isObject } from '../../lib/main/json';
import type { ToolId } from '../shared/tools';

const savedViewsWait = 1000;

export interface ViewOfTab {
  readonly tool: ToolId;
  readonly view: string;
}

export type ViewVersions = (tool: ToolId) => number;

export function savedViewsOf(
  saved: unknown,
  tools: ReadonlyMap<string, ToolId>,
  versions: ViewVersions,
): ReadonlyMap<string, string> {
  if (!isObject(saved)) {
    return new Map();
  }
  return new Map(
    Object.entries(saved).flatMap(([tab, kept]) => {
      const tool = tools.get(tab);
      return tool !== undefined &&
        isObject(kept) &&
        kept.version === versions(tool) &&
        typeof kept.view === 'string' &&
        kept.view.length <= maxViewChars
        ? [[tab, kept.view] as const]
        : [];
    }),
  );
}

export function viewsToSave(
  views: Iterable<readonly [string, ViewOfTab]>,
  versions: ViewVersions,
): Record<string, { readonly version: number; readonly view: string }> {
  return Object.fromEntries(
    [...views].flatMap(([tab, { tool, view }]) =>
      view.length <= maxViewChars
        ? [[tab, { version: versions(tool), view }]]
        : [],
    ),
  );
}

export class ViewSaver {
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly write: () => void,
    private readonly wait = savedViewsWait,
  ) {}

  changed(): void {
    if (this.timer === undefined) {
      this.timer = setTimeout(() => this.flush(), this.wait);
    }
  }

  flush(): void {
    if (this.timer === undefined) {
      return;
    }
    clearTimeout(this.timer);
    this.timer = undefined;
    this.write();
  }
}

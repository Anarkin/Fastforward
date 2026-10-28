import {
  diffLayouts,
  type GitToHost,
  type GitToWebview,
} from '../../tools/git/shared/protocol';
import type { GitSettings } from '../../tools/git/shared/settings';

export const tools = ['git', 'files', 'terminal'] as const;

export type ToolId = (typeof tools)[number];

export function isTool(value: unknown): value is ToolId {
  return tools.some((tool) => tool === value);
}

interface ToolMessages {
  readonly git: {
    readonly toHost: GitToHost;
    readonly toWebview: GitToWebview;
  };
  readonly files: { readonly toHost: never; readonly toWebview: never };
  readonly terminal: { readonly toHost: never; readonly toWebview: never };
}

export type ToolToHost = {
  readonly [K in ToolId]: {
    readonly type: 'tool';
    readonly tool: K;
    readonly message: ToolMessages[K]['toHost'];
  };
}[ToolId];

export type ToolToWebview = {
  readonly [K in ToolId]: {
    readonly type: 'tool';
    readonly tool: K;
    readonly message: ToolMessages[K]['toWebview'];
  };
}[ToolId];

export type ToHostOf<K extends ToolId> = ToolMessages[K]['toHost'];

export type ToWebviewOfTool<K extends ToolId> = ToolMessages[K]['toWebview'];

type NoSettings = Readonly<Record<string, never>>;

export interface ToolSettings {
  readonly git: GitSettings;
  readonly files: NoSettings;
  readonly terminal: NoSettings;
}

export const toolSettingChoices: ReadonlyMap<string, readonly string[]> =
  new Map([['tools.git.diffLayout', diffLayouts]]);

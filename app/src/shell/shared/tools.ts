import {
  diffLayouts,
  type GitToHost,
  type GitToWebview,
} from '../../tools/git/shared/protocol';
import type { GitSettings } from '../../tools/git/shared/settings';
import type {
  TerminalToHost,
  TerminalToWebview,
} from '../../tools/terminal/shared/protocol';
import {
  renderers,
  type TerminalSettings,
} from '../../tools/terminal/shared/settings';

export const tools = ['terminal', 'files', 'git'] as const;

export type ToolId = (typeof tools)[number];

export const confirmsClose: Readonly<Record<ToolId, boolean>> = {
  terminal: true,
  files: false,
  git: false,
};

export function isTool(value: unknown): value is ToolId {
  return tools.some((tool) => tool === value);
}

interface ToolMessages {
  readonly terminal: {
    readonly toHost: TerminalToHost;
    readonly toWebview: TerminalToWebview;
  };
  readonly files: { readonly toHost: never; readonly toWebview: never };
  readonly git: {
    readonly toHost: GitToHost;
    readonly toWebview: GitToWebview;
  };
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

export interface ThemeColors {
  readonly light: Readonly<Record<string, string>>;
  readonly dark: Readonly<Record<string, string>>;
}

interface Themed {
  readonly colors: ThemeColors;
}

export interface ToolSettings {
  readonly terminal: TerminalSettings & Themed;
  readonly files: Themed;
  readonly git: GitSettings & Themed;
}

export const toolSettingChoices: ReadonlyMap<string, readonly string[]> =
  new Map<string, readonly string[]>([
    ['tools.git.diffLayout', diffLayouts],
    ['tools.terminal.renderer', renderers],
  ]);

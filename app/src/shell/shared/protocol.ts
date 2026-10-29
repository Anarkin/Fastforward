import type { ToolId, ToolToHost, ToolToWebview } from './tools';

export const maxNotices = 4;

export interface TabInfo {
  readonly id: string;
  readonly tool: ToolId;
  readonly name: string;
  readonly folder?: string;
  readonly root?: string;
}

export interface ToolChoice {
  readonly tool: ToolId;
  readonly fits: boolean;
}

export interface AboutInfo {
  readonly version: string;
  readonly development: boolean;
  readonly git: string;
  readonly system: string;
}

export type UpdateStatus =
  | { readonly kind: 'idle' }
  | { readonly kind: 'checking' }
  | { readonly kind: 'upToDate' }
  | {
      readonly kind: 'downloading';
      readonly version: string;
      readonly percent: number;
    }
  | { readonly kind: 'ready'; readonly version: string }
  | { readonly kind: 'available'; readonly version: string }
  | { readonly kind: 'failed' };

export type ToHost =
  | { readonly type: 'ready' }
  | { readonly type: 'selectTab'; readonly tab: string }
  | { readonly type: 'closeTab'; readonly tab: string }
  | { readonly type: 'moveTab'; readonly tab: string; readonly index: number }
  | { readonly type: 'preloadTab'; readonly tab: string }
  | { readonly type: 'sortTabs' }
  | { readonly type: 'setAutoSortTabs'; readonly on: boolean }
  | { readonly type: 'newTab'; readonly tool: ToolId }
  | { readonly type: 'openWith'; readonly tool: ToolId | undefined }
  | { readonly type: 'copyText'; readonly text: string }
  | { readonly type: 'openSettings' }
  | { readonly type: 'openDefaultSettings' }
  | { readonly type: 'checkForUpdates' }
  | { readonly type: 'installUpdate' }
  | { readonly type: 'quit' }
  | { readonly type: 'installTerminalCommand' }
  | {
      readonly type: 'log';
      readonly level: 'info' | 'error';
      readonly message: string;
    }
  | ToolToHost;

export type ToWebview =
  | {
      readonly type: 'tabs';
      readonly tabs: readonly TabInfo[];
      readonly active: string | undefined;
    }
  | { readonly type: 'autoSortTabs'; readonly on: boolean }
  | { readonly type: 'update'; readonly status: UpdateStatus }
  | ({ readonly type: 'about' } & AboutInfo)
  | { readonly type: 'terminalCommand'; readonly installable: boolean }
  | { readonly type: 'confirmQuit' }
  | {
      readonly type: 'chooseTool';
      readonly folders: readonly string[];
      readonly choices: readonly ToolChoice[];
      readonly picked: ToolId | undefined;
    }
  | {
      readonly type: 'notice';
      readonly level: 'info' | 'error';
      readonly message: string;
    }
  | ToolToWebview;

export type ToWebviewOf<T extends ToWebview['type']> = Extract<
  ToWebview,
  { readonly type: T }
>;

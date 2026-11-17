import type { Renderer } from './settings';

export const viewVersion = 1;

export const maxInputLength = 65_536;

export interface WindowsPty {
  readonly backend: 'conpty';
  readonly buildNumber: number;
}

export interface CellPosition {
  readonly x: number;
  readonly y: number;
}

export interface CellRange {
  readonly start: CellPosition;
  readonly end: CellPosition;
}

export type TerminalToHost =
  | {
      readonly type: 'open';
      readonly tab: string;
      readonly columns: number;
      readonly rows: number;
    }
  | { readonly type: 'input'; readonly tab: string; readonly data: string }
  | {
      readonly type: 'resize';
      readonly tab: string;
      readonly columns: number;
      readonly rows: number;
    }
  | { readonly type: 'ack'; readonly tab: string; readonly chars: number }
  | { readonly type: 'restart'; readonly tab: string }
  | {
      readonly type: 'scrolled';
      readonly tab: string;
      readonly top: number | undefined;
    }
  | {
      readonly type: 'selected';
      readonly tab: string;
      readonly selection: CellRange | undefined;
    }
  | { readonly type: 'newTab' }
  | { readonly type: 'openFolder'; readonly folder: string }
  | { readonly type: 'browseFolders' }
  | { readonly type: 'forgetFolder'; readonly folder: string };

export type TerminalToWebview =
  | {
      readonly type: 'settings';
      readonly renderer: Renderer;
      readonly scrollback: number;
      readonly minimumContrastRatio: number;
      readonly windowsPty: WindowsPty | undefined;
    }
  | { readonly type: 'show'; readonly tab: string }
  | { readonly type: 'hide' }
  | {
      readonly type: 'screen';
      readonly tab: string;
      readonly data: string;
      readonly exited: boolean;
      readonly top?: number;
      readonly selection?: CellRange;
    }
  | { readonly type: 'output'; readonly tab: string; readonly data: string }
  | { readonly type: 'exited'; readonly tab: string }
  | { readonly type: 'folders'; readonly folders: readonly string[] };

export type TerminalToWebviewOf<T extends TerminalToWebview['type']> = Extract<
  TerminalToWebview,
  { readonly type: T }
>;

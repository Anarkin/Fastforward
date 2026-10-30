import type { Renderer } from './settings';

export const maxInputLength = 65_536;

const maxSize = 1000;

export interface WindowsPty {
  readonly backend: 'conpty';
  readonly buildNumber: number;
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
    }
  | { readonly type: 'output'; readonly tab: string; readonly data: string }
  | { readonly type: 'exited'; readonly tab: string }
  | { readonly type: 'folders'; readonly folders: readonly string[] };

export type TerminalToWebviewOf<T extends TerminalToWebview['type']> = Extract<
  TerminalToWebview,
  { readonly type: T }
>;

export function isSize(columns: unknown, rows: unknown): boolean {
  return [columns, rows].every(
    (value) =>
      typeof value === 'number' &&
      Number.isInteger(value) &&
      value >= 1 &&
      value <= maxSize,
  );
}

export function inputChunks(
  data: string,
  length: number = maxInputLength,
): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < data.length) {
    let end = Math.min(start + length, data.length);
    if (
      end < data.length &&
      end - 1 > start &&
      isHighSurrogate(data.charCodeAt(end - 1))
    ) {
      end -= 1;
    }
    chunks.push(data.slice(start, end));
    start = end;
  }
  return chunks;
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}
